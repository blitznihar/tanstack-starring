import { randomUUID } from "node:crypto";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { contentRepo } from "~/repositories/content.js";
import { itemUsageRepo } from "~/repositories/itemUsage.js";
import { lessonProgressRepo } from "~/repositories/lessonProgress.js";
import { robuxLedgerRepo } from "~/repositories/robuxLedger.js";
import { examsRepo, type ExamDoc } from "~/repositories/exams.js";
import { examSessionsRepo, type ExamSessionDoc } from "~/repositories/examSessions.js";
import { assembleExam, type ExamKind } from "~/domain/exam/assemble.js";
import {
  createSession,
  settle,
  answer as sAnswer,
  toggleFlag as sFlag,
  pause as sPause,
  resume as sResume,
  next as sNext,
  prev as sPrev,
  goto as sGoto,
  endBreak as sEndBreak,
  submit as sSubmit,
  remainingSeconds,
  breakRemainingSeconds,
  type ExamSessionState,
} from "~/domain/exam/session.js";
import { scoreExamSession, type ExamResult } from "~/domain/exam/scoreExam.js";
import { walletFor } from "~/server/gamification/wallet.js";
import { recordAttempt, masterySummary } from "~/server/mastery/mastery.js";
import { queueExamProgressReport } from "~/server/notifications/progressReports.js";
import {
  enqueueWrittenJobs,
  processSessionJobs,
  writtenScoresForSession,
  anyScoringPending,
  type WrittenScore,
} from "~/server/scoring/scoring.js";
import { passagesRepo } from "~/repositories/passages.js";
import { richToText } from "~/lib/richText.js";
import { env } from "~/lib/env.js";
import type { AuthContext } from "~/server/auth/session.js";
import type { Item } from "~/schemas/item.js";
import type { Passage } from "~/schemas/passage.js";
import type { Program } from "~/schemas/program.js";

function assertOwner(actor: AuthContext, enrollment: { studentId: string } | null): void {
  if (!enrollment) throw new Error("Enrollment not found");
  const isOwner = actor.userId === enrollment.studentId;
  const isAdmin = actor.roles.includes("admin") || actor.roles.includes("super_admin");
  if (!isOwner && !isAdmin) throw new Error("Forbidden: not your enrollment");
}

const now = () => Date.now();

export type ExamItemReview = {
  itemId: string;
  subject: string;
  teks: string;
  prompt: string;
  correct: boolean;
  pending: boolean;
  yourAnswer: string;
  whyWrong: string;
  solution: string;
};
export type ExamResultPayload = ExamResult & {
  itemReview: ExamItemReview[];
  perCorrect: number;
  perWrong: number;
};

/** Derive completed + weak topics for assembly. Exams only cover completed lessons. */
async function deriveProgress(
  enrollmentId: string,
  programKey: string,
): Promise<{ completed: string[]; weak: string[] }> {
  const allTopics = [...new Set((await contentRepo.listItems({ programKey })).flatMap((i) => i.standardCodes))];
  const [completed, summary] = await Promise.all([
    lessonProgressRepo.completedCodes(enrollmentId),
    masterySummary(enrollmentId, allTopics),
  ]);
  return { completed, weak: summary.weak };
}

export type BuildExamInput = {
  enrollmentId: string;
  kind?: ExamKind;
  durationSeconds?: number;
  splitPct?: Record<string, number>;
  totalItems?: number;
};

export async function buildExam(actor: AuthContext, input: BuildExamInput): Promise<{ examId: string; coverage: string[]; itemCount: number; earnUpTo: number }> {
  const enrollment = await enrollmentsRepo.findById(input.enrollmentId);
  assertOwner(actor, enrollment);
  const program = await programsRepo.findByKey(enrollment!.programKey);
  if (!program) throw new Error("Program not found");

  const kind: ExamKind = input.kind ?? "progressive";
  const subjects = program.subjects;
  const bankBySubject: Record<string, Item[]> = {};
  for (const subject of subjects) {
    bankBySubject[subject] = await contentRepo.listItems({ programKey: enrollment!.programKey, subject });
  }
  const { completed, weak } = await deriveProgress(input.enrollmentId, enrollment!.programKey);
  if (completed.length === 0) throw new Error("Complete at least one lesson before starting an exam.");
  const usedIds = await itemUsageRepo.usedItemIds(input.enrollmentId);

  const assembled = assembleExam({
    subjects,
    bankBySubject,
    completedTopics: completed,
    weakTopics: weak,
    usedIds,
    splitPct: input.splitPct ?? program.examBlueprint.defaultSplitPct,
    totalItems: input.totalItems ?? 10,
    durationSeconds: input.durationSeconds ?? program.examBlueprint.defaultDurationMinutes * 60,
    breakSeconds: program.examBlueprint.breakSeconds,
  });
  if (assembled.itemIds.length === 0) throw new Error("No exam questions are available for the completed lessons yet.");

  const examId = randomUUID();
  const doc: ExamDoc = {
    _id: examId,
    enrollmentId: input.enrollmentId,
    kind,
    sections: assembled.sections,
    itemIds: assembled.itemIds,
    durationSeconds: assembled.durationSeconds,
    breakSeconds: assembled.breakSeconds,
    splitPct: assembled.splitPct,
    coverage: assembled.coverage,
    createdAt: new Date(),
  };
  await examsRepo.insert(doc);

  return {
    examId,
    coverage: assembled.coverage,
    itemCount: assembled.itemIds.length,
    earnUpTo: assembled.itemIds.length * program.robuxRules.examCorrect,
  };
}

export async function startSession(actor: AuthContext, examId: string): Promise<{ sessionId: string }> {
  const exam = await examsRepo.findById(examId);
  if (!exam) throw new Error("Exam not found");
  const enrollment = await enrollmentsRepo.findById(exam.enrollmentId);
  assertOwner(actor, enrollment);

  const state = createSession({
    examId,
    enrollmentId: exam.enrollmentId,
    durationSeconds: exam.durationSeconds,
    breakSeconds: exam.breakSeconds,
    sections: exam.sections.map((s) => ({ subject: s.subject, count: s.itemIds.length, seconds: s.seconds })),
    itemIds: exam.itemIds,
    now: now(),
  });

  const sessionId = randomUUID();
  const doc: ExamSessionDoc = { ...state, _id: sessionId, studentId: enrollment!.studentId, createdAt: new Date(), updatedAt: new Date() };
  await examSessionsRepo.insert(doc);
  return { sessionId };
}

async function loadOwned(actor: AuthContext, sessionId: string): Promise<{ doc: ExamSessionDoc; state: ExamSessionState }> {
  const doc = await examSessionsRepo.findById(sessionId);
  if (!doc) throw new Error("Session not found");
  if (actor.userId !== doc.studentId && !actor.roles.includes("admin") && !actor.roles.includes("super_admin")) {
    throw new Error("Forbidden: not your session");
  }
  // Normalize against the clock (auto-submit if expired) before any use.
  const settled = settle(doc, now());
  if (settled !== doc) {
    await examSessionsRepo.save(sessionId, settled);
    if (settled.status === "submitted") await finalizeIfNeeded(sessionId, settled, doc.result);
  }
  return { doc, state: settled };
}

/** Serializable answer value echoed back to the student (their own selection). */
type ExamResponse = string | string[] | Record<string, string> | null;

function toResponse(value: unknown): ExamResponse {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = String(v);
    return out;
  }
  return String(value);
}

/** A passage as the player needs it — numbered paragraphs, no answers anywhere. */
type SanitizedPassage = { id: string; title: string; genre: string; level: string | null; paragraphs: string[] };

function passageView(passage: Passage | null | undefined): SanitizedPassage | null {
  if (!passage) return null;
  return {
    id: passage.id,
    title: passage.title,
    genre: passage.genre,
    level: passage.level ?? null,
    paragraphs: passage.body.map((n) => (typeof n === "string" ? n : n.text ?? "")).filter(Boolean),
  };
}

/** Has the student supplied any answer for an item? (string/array/object aware) */
function hasAnswer(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

function sanitizeItem(item: Item, response: unknown, passage: SanitizedPassage | null) {
  const correctCount = item.type === "multiselect" ? (item.options ?? []).filter((option) => option.correct).length : 0;
  const selectInstruction = item.type === "multiselect"
    ? richToText(item.prompt).toLowerCase().includes("select all")
      ? "Select all that apply."
      : correctCount === 2
        ? "Select TWO."
        : correctCount > 0
          ? `Select ${correctCount} answers.`
          : "Select all that apply."
    : null;
  // NEVER expose correct/answer/explanation/rationale/rubric/blanks values for a
  // live item (§7, §18). Only the render scaffolding the student needs.
  return {
    itemId: item._id,
    subject: item.subject,
    type: item.type,
    selectInstruction,
    teks: item.standardCodes.map((c) => `TEKS ${c}`).join(", "),
    prompt: richToText(item.prompt),
    passage,
    figures: item.figures.map((f) => ({
      id: f.id,
      kind: f.kind,
      svg: f.svg ?? null,
      alt: f.alt,
      caption: f.caption ?? null,
      dataJson: f.data ? JSON.stringify(f.data) : null,
    })),
    // MC/multiselect choices, and inline_choice dropdown choices (text only).
    options: (item.options ?? []).map((o) => ({ key: o.key, text: o.text })),
    // inline_choice / text_entry: blank ids only (NOT the correct values).
    blankIds: item.blanks ? Object.keys(item.blanks) : [],
    // hot_text selectable spans (these are the prompt text, safe to show).
    tokens: (item.tokens ?? []).map((t) => ({ id: t.id, text: t.text })),
    // multipart sub-questions — prompt + choice text only, never the answer key.
    parts: (item.parts ?? []).map((p) => ({
      id: p.id,
      prompt: richToText(p.prompt),
      type: p.type,
      options: (p.options ?? []).map((o) => ({ key: o.key, text: o.text })),
    })),
    maxPoints: item.rubric?.maxPoints ?? item.points ?? 1,
    response: toResponse(response),
  };
}

async function view(state: ExamSessionState, exam: ExamDoc, program: Program, sessionId: string) {
  const items = await contentRepo.listItems({ programKey: program.key });
  const byId = new Map(items.map((i) => [i._id, i]));
  const currentItem = state.itemIds[state.currentItem];
  const item = currentItem ? byId.get(currentItem) : undefined;
  const currentSubject = state.sections[state.sectionIndex]?.subject ?? "";

  // Resolve the current item's reading passage (RLA), if any.
  let passage: SanitizedPassage | null = null;
  if (item?.passageRef) {
    passage = passageView(await passagesRepo.findByRef(program.key, item.subject, item.passageRef));
  }

  const review = state.itemIds.map((id, i) => ({
    num: i + 1,
    itemId: id,
    answered: hasAnswer(state.responses[id]),
    flagged: state.flagged.includes(id),
    section: exam.sections.findIndex((s) => s.itemIds.includes(id)),
  }));

  return {
    sessionId,
    status: state.status,
    examTitle: program.title,
    durationSeconds: state.durationSeconds,
    remainingSeconds: remainingSeconds(state, now()),
    breakRemainingSeconds: breakRemainingSeconds(state, now()),
    sectionIndex: state.sectionIndex,
    sectionSubject: currentSubject,
    total: state.itemIds.length,
    currentNum: state.currentItem + 1,
    current: item ? sanitizeItem(item, state.responses[item._id], passage) : null,
    isRLA: currentSubject === "rla",
    // Grade 3 Math has NO calculator (§7).
    noCalculator: program.key.startsWith("grade3") && currentSubject === "math",
    flagged: state.flagged,
    answeredCount: review.filter((r) => r.answered).length,
    review,
  };
}

type ExamEvent =
  | { kind: "answer"; itemId: string; value: unknown }
  | { kind: "flag"; itemId: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "next" }
  | { kind: "prev" }
  | { kind: "goto"; index: number }
  | { kind: "endBreak" };

export async function applyEvent(actor: AuthContext, sessionId: string, event: ExamEvent) {
  const { state } = await loadOwned(actor, sessionId);
  const t = now();
  let nextState: ExamSessionState;
  switch (event.kind) {
    case "answer": nextState = sAnswer(state, event.itemId, event.value, t); break;
    case "flag": nextState = sFlag(state, event.itemId, t); break;
    case "pause": nextState = sPause(state, t); break;
    case "resume": nextState = sResume(state, t); break;
    case "next": nextState = sNext(state, t); break;
    case "prev": nextState = sPrev(state, t); break;
    case "goto": nextState = sGoto(state, event.index, t); break;
    case "endBreak": nextState = sEndBreak(state, t); break;
  }
  await examSessionsRepo.save(sessionId, nextState);
  const exam = await examsRepo.findById(nextState.examId);
  const enrollment = await enrollmentsRepo.findById(nextState.enrollmentId);
  const program = await programsRepo.findByKey(enrollment!.programKey);
  return view(nextState, exam!, program!, sessionId);
}

export async function getSessionView(actor: AuthContext, sessionId: string) {
  const { state } = await loadOwned(actor, sessionId);
  const exam = await examsRepo.findById(state.examId);
  const enrollment = await enrollmentsRepo.findById(state.enrollmentId);
  const program = await programsRepo.findByKey(enrollment!.programKey);
  return view(state, exam!, program!, sessionId);
}

/**
 * Render a student's committed answer for the post-submit review, per item type.
 * Every RLA type commits a different shape (string key, string[] of keys/token
 * ids, or a {blankId|partId: value} object); a bare `String(...)` would print
 * "[object Object]" / comma-joined keys for everything but multiple_choice.
 */
function responseToDisplay(item: Item, response: unknown): string {
  if (response == null || (typeof response === "string" && response.trim() === "")) return "(blank)";
  const opts = item.options ?? [];
  const optText = (key: string) => {
    const o = opts.find((x) => x.key === key);
    return o ? `${o.key}. ${o.text}` : key;
  };
  const asObj = response && typeof response === "object" && !Array.isArray(response)
    ? (response as Record<string, string>)
    : null;

  switch (item.type) {
    case "multiple_choice":
      return typeof response === "string" ? optText(response) : String(response);
    case "multiselect": {
      const keys = Array.isArray(response) ? (response as string[]) : [];
      return keys.length ? keys.map(optText).join("; ") : "(blank)";
    }
    case "hot_text": {
      const ids = Array.isArray(response) ? (response as string[]) : [];
      const byId = new Map((item.tokens ?? []).map((t) => [t.id, t.text]));
      return ids.length ? ids.map((id) => `“${byId.get(id) ?? id}”`).join("; ") : "(blank)";
    }
    case "inline_choice": {
      const byKey = new Map(opts.map((o) => [o.key, o.text]));
      const vals = asObj ? Object.values(asObj).filter((v) => v !== "") : [];
      return vals.length ? vals.map((v) => byKey.get(v) ?? v).join("; ") : "(blank)";
    }
    case "multipart": {
      const out = (item.parts ?? [])
        .map((p) => {
          const k = asObj?.[p.id];
          if (!k) return null;
          const po = (p.options ?? []).find((o) => o.key === k);
          return `${p.id.toUpperCase()}: ${po ? `${po.key}. ${po.text}` : k}`;
        })
        .filter((x): x is string => x != null);
      return out.length ? out.join("   ") : "(blank)";
    }
    case "text_entry": {
      if (asObj) {
        const vals = Object.values(asObj).filter((v) => v !== "");
        return vals.length ? vals.join("; ") : "(blank)";
      }
      return typeof response === "string" ? response : String(response);
    }
    default:
      if (typeof response === "string") return response;
      if (Array.isArray(response)) return (response as string[]).join("; ");
      return JSON.stringify(response);
  }
}

/** Score + book Robux + record usage on first transition to submitted (idempotent). */
async function finalizeIfNeeded(sessionId: string, state: ExamSessionState, priorResult: unknown) {
  if (priorResult) return; // already finalized
  const exam = await examsRepo.findById(state.examId);
  if (!exam) return;
  const enrollment = await enrollmentsRepo.findById(state.enrollmentId);
  const program = await programsRepo.findByKey(enrollment!.programKey);
  if (!program) return;

  const items = (await contentRepo.listItems({ programKey: program.key })).filter((i) => state.itemIds.includes(i._id));
  const conversionTables: Record<string, (typeof program.scoringModel.conversionTables)[number] | undefined> = {};
  for (const subj of program.subjects) {
    conversionTables[subj] = program.scoringModel.conversionTables.find((t) => t.subject === subj);
  }

  const result = scoreExamSession({
    items,
    responses: state.responses,
    conversionTables,
    robuxRules: { examCorrect: program.robuxRules.examCorrect, examWrong: program.robuxRules.examWrong },
    examFloor: env.robux.examAwardFloor,
  });

  // No-repeat: every exam item is now used.
  await itemUsageRepo.recordMany(state.enrollmentId, state.itemIds, "exam");
  // Update mastery from each auto-scored item (§9).
  const itemsById = new Map(items.map((i) => [i._id, i]));
  for (const r of result.itemResults) {
    if (r.pending) continue;
    const item = itemsById.get(r.itemId);
    if (item) await recordAttempt(state.enrollmentId, item.standardCodes, r.correct);
  }
  // Book the net award (idempotent via refId = sessionId).
  if (result.robux.net > 0) {
    await robuxLedgerRepo.add({ enrollmentId: state.enrollmentId, type: "earn", amount: result.robux.net, source: "exam", refId: sessionId });
  }

  // Build the post-submit results payload (now safe to include solutions).
  const byId = new Map(items.map((i) => [i._id, i]));
  const itemReview = result.itemResults.map((r) => {
    const item = byId.get(r.itemId)!;
    const response = state.responses[r.itemId];
    // whyWrong (the selected distractor's rationale) only applies to a single-key
    // selection; other types don't carry a per-option rationale.
    const selOpt = typeof response === "string" ? (item.options ?? []).find((o) => o.key === response) : undefined;
    return {
      itemId: r.itemId,
      subject: r.subject,
      teks: item.standardCodes.join(", "),
      prompt: richToText(item.prompt),
      correct: r.correct,
      pending: r.pending,
      yourAnswer: responseToDisplay(item, response),
      whyWrong: !r.correct && selOpt ? (selOpt.rationale ?? "") : "",
      solution: richToText(item.workedSolution) || richToText(item.explanation),
    };
  });

  await examSessionsRepo.saveResult(sessionId, { ...result, itemReview, perCorrect: program.robuxRules.examCorrect, perWrong: program.robuxRules.examWrong });
  await queueExamProgressReport(state.enrollmentId, {
    title: program.title,
    correctCount: result.overall.correctCount,
    wrongCount: result.overall.wrongCount,
    scorePct: result.overall.total > 0 ? Math.round((result.overall.correctCount / result.overall.total) * 100) : undefined,
    robuxNet: result.robux.net,
  });

  // §8: enqueue async SCR/ECR scoring (one job per written item) and kick it off
  // in the background. Submission has already returned — this never blocks it.
  await enqueueWrittenJobs(sessionId, state.enrollmentId, items, state.responses);
  void processSessionJobs(sessionId).catch(() => {});
}

export async function submitExam(actor: AuthContext, sessionId: string) {
  const { state } = await loadOwned(actor, sessionId);
  const submitted = sSubmit(state, now());
  await examSessionsRepo.save(sessionId, submitted);
  // loadOwned may have already finalized an expired session; pass the current
  // result so the in-code guard short-circuits instead of relying only on the DB.
  const fresh = await examSessionsRepo.findById(sessionId);
  await finalizeIfNeeded(sessionId, submitted, fresh?.result);
  return getResult(actor, sessionId);
}

function assertSessionAccess(actor: AuthContext, doc: ExamSessionDoc): void {
  if (actor.userId !== doc.studentId && !actor.roles.includes("admin") && !actor.roles.includes("super_admin")) {
    throw new Error("Forbidden: not your session");
  }
}

export type ResultView = {
  submitted: true;
  result: ExamResultPayload | null;
  written: WrittenScore[];
  scoringPending: boolean;
  wallet: { available: number; lifetime: number };
};

async function buildResultView(doc: ExamSessionDoc): Promise<ResultView> {
  const wallet = await walletFor(doc.enrollmentId);
  const written = await writtenScoresForSession(doc._id);
  return {
    submitted: true as const,
    result: (doc.result ?? null) as ExamResultPayload | null,
    written,
    scoringPending: anyScoringPending(written),
    wallet: { available: wallet.available, lifetime: wallet.lifetimeEarned },
  };
}

export async function getResult(actor: AuthContext, sessionId: string): Promise<ResultView | { submitted: false }> {
  const doc = await examSessionsRepo.findById(sessionId);
  if (!doc) throw new Error("Session not found");
  assertSessionAccess(actor, doc);
  if (doc.status !== "submitted") return { submitted: false as const };
  return buildResultView(doc);
}

/**
 * Advance SCR/ECR scoring for a submitted session, then return the merged result.
 * Read-only `getResult` never calls DMR; the results page polls THIS while any
 * written item is still pending. `processSessionJobs` is idempotent (atomic claim),
 * so concurrent polls are safe.
 */
export async function scoreWrittenForSession(
  actor: AuthContext,
  sessionId: string,
): Promise<ResultView | { submitted: false }> {
  const doc = await examSessionsRepo.findById(sessionId);
  if (!doc) throw new Error("Session not found");
  assertSessionAccess(actor, doc);
  if (doc.status !== "submitted") return { submitted: false as const };
  await processSessionJobs(sessionId);
  return buildResultView(doc);
}
