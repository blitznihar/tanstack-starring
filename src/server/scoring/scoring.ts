import { randomUUID } from "node:crypto";
import { scoringJobsRepo, type ScoringJobDoc } from "~/repositories/scoringJobs.js";
import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { usersRepo } from "~/repositories/users.js";
import { requireCapability } from "~/server/auth/rbac.js";
import { dmrChat, DmrError, aiEnabled } from "~/ai/dmrClient.js";
import { buildScoringMessages } from "~/ai/rubricPrompt.js";
import { parseDmrReply } from "~/domain/scoring/aiScore.js";
import { richToText } from "~/lib/richText.js";
import type { AuthContext } from "~/server/auth/session.js";
import type { Item } from "~/schemas/item.js";
import type { ScoringJobStatus, ScoringSource } from "~/schemas/scoringJob.js";

/**
 * SCR/ECR async scoring (§8). Submission is NEVER blocked by any of this.
 *
 *   finalize → enqueueWrittenJobs (one job per written item)
 *           → processSessionJobs (best-effort; also re-runnable from the client)
 *
 * Each job calls the configured AI scorer. AI off/unreachable/unparseable → status
 * `manual` (human queue). A parent/admin can `overrideScore` at any time, which
 * wins over any AI score. Stale `scoring` jobs (a crashed worker) are released
 * back to `pending` so they retry.
 */

const STALE_MS = 2 * 60 * 1000; // a job stuck "scoring" longer than this is retryable
const MAX_ATTEMPTS = 3; // crash cycles before a stuck job is sent to the manual queue for good

export type WrittenScore = {
  jobId: string;
  itemId: string;
  subject: string;
  teks: string;
  itemType: "scr" | "ecr";
  prompt: string;
  maxPoints: number;
  status: ScoringJobStatus;
  source: ScoringSource | null;
  score: number | null;
  justification: string;
  tips: string[];
  exemplar: string;
  responseText: string;
  error: string | null;
};

function responseToText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Enqueue one scoring job per written (scr/ecr) item in the submitted exam. Idempotent. */
export async function enqueueWrittenJobs(
  sessionId: string,
  enrollmentId: string,
  items: Item[],
  responses: Record<string, unknown>,
): Promise<number> {
  let enqueued = 0;
  const now = new Date();
  for (const item of items) {
    if (item.type !== "scr" && item.type !== "ecr") continue;
    const job: ScoringJobDoc = {
      _id: randomUUID(),
      examSessionId: sessionId,
      enrollmentId,
      itemId: item._id,
      subject: item.subject,
      itemType: item.type,
      maxPoints: item.rubric?.maxPoints ?? item.points ?? (item.type === "ecr" ? 5 : 2),
      responseText: responseToText(responses[item._id]),
      status: "pending",
      score: null,
      justification: "",
      tips: [],
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (await scoringJobsRepo.enqueue(job)) enqueued++;
  }
  return enqueued;
}

/** Score one claimed job via AI; route to manual on any failure. */
async function scoreClaimedJob(job: ScoringJobDoc): Promise<void> {
  const item = await contentRepo.findItem(job.itemId);
  if (!item || !item.rubric) {
    await scoringJobsRepo.update(job._id, { status: "manual", error: "missing item/rubric" });
    return;
  }
  // No model available → straight to the manual queue (graceful fallback, §8).
  if (!aiEnabled()) {
    await scoringJobsRepo.update(job._id, { status: "manual", error: "AI_ENABLED=false" });
    return;
  }
  try {
    const messages = buildScoringMessages({
      itemType: job.itemType,
      question: richToText(item.prompt),
      rubric: item.rubric,
      exemplar: richToText(item.workedSolution) || richToText(item.explanation),
      studentResponse: job.responseText,
    });
    const raw = await dmrChat(messages);
    const parsed = parseDmrReply(raw, job.maxPoints);
    if (!parsed.ok) {
      await scoringJobsRepo.update(job._id, { status: "manual", error: `unparseable: ${parsed.error}` });
      return;
    }
    await scoringJobsRepo.update(job._id, {
      status: "scored",
      source: "ai",
      score: parsed.score,
      justification: parsed.justification,
      tips: parsed.tips,
      scoredAt: new Date(),
      error: undefined,
    });
  } catch (err) {
    const msg = err instanceof DmrError ? err.message : err instanceof Error ? err.message : String(err);
    // Unreachable/timeout/HTTP error → manual queue. Never throw to the caller.
    await scoringJobsRepo.update(job._id, { status: "manual", error: msg });
  }
}

/**
 * Process all outstanding jobs for a session (best-effort, non-blocking for the
 * student). Safe to call repeatedly: `claim` is atomic so no job is scored twice.
 */
export async function processSessionJobs(sessionId: string): Promise<void> {
  const jobs = await scoringJobsRepo.listForSession(sessionId);
  const now = Date.now();
  for (const j of jobs) {
    // Release a job a crashed worker left in "scoring" — but a job that keeps
    // crashing mid-call is routed to the manual queue once attempts are exhausted
    // (never loop forever, §8).
    if (j.status === "scoring" && now - new Date(j.updatedAt).getTime() > STALE_MS) {
      await scoringJobsRepo.releaseStaleOrFail(j._id, MAX_ATTEMPTS);
    }
  }
  const fresh = await scoringJobsRepo.listForSession(sessionId);
  await Promise.all(
    fresh
      .filter((j) => j.status === "pending")
      .map(async (j) => {
        const claimed = await scoringJobsRepo.claim(j._id);
        if (claimed) await scoreClaimedJob(claimed);
      }),
  );
}

function toWritten(job: ScoringJobDoc, item: Item | undefined): WrittenScore {
  return {
    jobId: job._id,
    itemId: job.itemId,
    subject: job.subject,
    teks: item ? item.standardCodes.join(", ") : "",
    itemType: job.itemType,
    prompt: item ? richToText(item.prompt) : "",
    maxPoints: job.maxPoints,
    status: job.status,
    source: job.source ?? null,
    score: job.score,
    justification: job.justification,
    tips: job.tips,
    exemplar: item ? richToText(item.workedSolution) || richToText(item.explanation) : "",
    responseText: job.responseText,
    error: job.error ?? null,
  };
}

/** Merge jobs + items into the written-response review for a session's results. */
export async function writtenScoresForSession(sessionId: string): Promise<WrittenScore[]> {
  const jobs = await scoringJobsRepo.listForSession(sessionId);
  const out: WrittenScore[] = [];
  for (const job of jobs) {
    const item = (await contentRepo.findItem(job.itemId)) ?? undefined;
    out.push(toWritten(job, item));
  }
  return out;
}

/** True while any written item is still awaiting a score (pending/scoring). */
export function anyScoringPending(jobs: WrittenScore[]): boolean {
  return jobs.some((j) => j.status === "pending" || j.status === "scoring");
}

/** Parent/admin one-click override (§8) — the final word over any AI score. */
export async function overrideScore(
  actor: AuthContext,
  input: { jobId: string; score: number; justification?: string },
): Promise<WrittenScore> {
  requireCapability(actor.roles, "scoring.override");
  // Math.min/max do NOT sanitize NaN — a non-finite input would otherwise be
  // persisted as the authoritative final score. Reject it outright (§8: override
  // is the final word, so it must be a real number).
  if (!Number.isFinite(input.score)) throw new Error("Score must be a finite number");
  const job = await scoringJobsRepo.findById(input.jobId);
  if (!job) throw new Error("Scoring job not found");
  const score = Math.max(0, Math.min(job.maxPoints, Math.round(input.score * 2) / 2));
  await scoringJobsRepo.update(job._id, {
    status: "overridden",
    source: "override",
    score,
    justification: input.justification?.trim() || `Score set by ${actor.displayName}.`,
    scoredAt: new Date(),
  });
  const updated = (await scoringJobsRepo.findById(job._id))!;
  const item = (await contentRepo.findItem(job.itemId)) ?? undefined;
  return toWritten(updated, item);
}

export type ManualQueueRow = WrittenScore & {
  studentName: string;
  programTitle: string;
  enrollmentId: string;
  examSessionId: string;
};

/**
 * The human scoring queue (§8) for admin/parent: every written response that
 * needs attention — `manual` (AI unavailable) first, then AI `scored` ones a
 * human may want to confirm or override.
 */
export async function manualQueue(actor: AuthContext): Promise<ManualQueueRow[]> {
  requireCapability(actor.roles, "scoring.override");
  const jobs = await scoringJobsRepo.listByStatus(["manual", "scoring", "pending", "scored"]);

  // Fetch each DISTINCT item/enrollment/program/student once, in parallel, then
  // assemble rows from the maps — instead of 4 serial round-trips per job that
  // also refetched the same enrollment/program/student for every row in an exam.
  const itemIds = [...new Set(jobs.map((j) => j.itemId))];
  const enrollmentIds = [...new Set(jobs.map((j) => j.enrollmentId))];
  const [items, enrollments] = await Promise.all([
    Promise.all(itemIds.map((id) => contentRepo.findItem(id))),
    Promise.all(enrollmentIds.map((id) => enrollmentsRepo.findById(id))),
  ]);
  const itemById = new Map(itemIds.map((id, i) => [id, items[i] ?? undefined]));
  const enrollmentById = new Map(enrollmentIds.map((id, i) => [id, enrollments[i] ?? null]));

  const enrollmentList = [...enrollmentById.values()].filter((e): e is NonNullable<typeof e> => e != null);
  const programKeys = [...new Set(enrollmentList.map((e) => e.programKey))];
  const studentIds = [...new Set(enrollmentList.map((e) => e.studentId))];
  const [programs, students] = await Promise.all([
    Promise.all(programKeys.map((k) => programsRepo.findByKey(k))),
    Promise.all(studentIds.map((id) => usersRepo.findById(id))),
  ]);
  const programByKey = new Map(programKeys.map((k, i) => [k, programs[i] ?? null]));
  const studentById = new Map(studentIds.map((id, i) => [id, students[i] ?? null]));

  const rows: ManualQueueRow[] = jobs.map((job) => {
    const enrollment = enrollmentById.get(job.enrollmentId) ?? null;
    const program = enrollment ? programByKey.get(enrollment.programKey) ?? null : null;
    const student = enrollment ? studentById.get(enrollment.studentId) ?? null : null;
    return {
      ...toWritten(job, itemById.get(job.itemId)),
      studentName: student?.displayName ?? "Student",
      programTitle: program?.title ?? enrollment?.programKey ?? "",
      enrollmentId: job.enrollmentId,
      examSessionId: job.examSessionId,
    };
  });

  // manual first (needs a human), then in-progress, then AI-scored for review.
  const rank: Record<ScoringJobStatus, number> = { manual: 0, pending: 1, scoring: 1, scored: 2, overridden: 3 };
  return rows.sort((a, b) => rank[a.status] - rank[b.status]);
}
