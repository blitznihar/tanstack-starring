import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { contentRepo } from "~/repositories/content.js";
import { examSessionsRepo } from "~/repositories/examSessions.js";
import { lessonsRepo } from "~/repositories/lessons.js";
import { lessonProgressRepo } from "~/repositories/lessonProgress.js";
import { responsesRepo } from "~/repositories/responses.js";
import { robuxLedgerRepo } from "~/repositories/robuxLedger.js";
import { masterySummary } from "~/server/mastery/mastery.js";
import { walletFor } from "~/server/gamification/wallet.js";
import { getOrCreateSchedule } from "~/server/scheduler/scheduler.js";
import { toIso } from "~/lib/dates.js";
import type { AuthContext } from "~/server/auth/session.js";
import type { ExamResultPayload } from "~/server/exam/exam.js";
import type { PerformanceLevel } from "~/schemas/common.js";

/**
 * Reporting (§8): scores are reported per program (per enrollment) AND as an
 * overall cross-program rollup for the parent dashboard.
 */

export type SubjectLevel = { subject: string; level: PerformanceLevel | null; scale: number | null; raw: number };
export type HeatmapCell = { code: string; label: string; state: "mastered" | "partial" | "not_mastered" | "not_started"; accuracy: number };
export type ExamTrendPoint = { label: string; score: number; color: "good" | "warn" | "bad" };
export type ActivityRow = { date: string; type: "Exam" | "Practice" | "Robux"; detail: string; tag: string; good: boolean };
export type RobuxHistoryRow = { desc: string; amount: number; type: "earn" | "penalty" | "redeem_fulfilled" };
export type LessonProgressRow = {
  enrollmentId: string;
  programKey: string;
  programTitle: string;
  subject: string;
  standardCode: string;
  title: string;
  completed: boolean;
  needsWork: boolean;
  completedAt: string | null;
  masteryState: HeatmapCell["state"];
  source: "authored" | "standard";
};
export type ReportSourceCounts = {
  standards: number;
  lessonCompletions: number;
  masteryStates: number;
  submittedExams: number;
  practiceResponses: number;
  robuxLedgerEntries: number;
  generatedAt: string;
};

export type EnrollmentReport = {
  enrollmentId: string;
  programKey: string;
  programTitle: string;
  topicsCompleted: number;
  topicsTotal: number;
  completed: string[];
  remaining: string[];
  weak: string[];
  circuitBroken: string[];
  latestExam: { at: string | null; perSubject: SubjectLevel[]; correct: number; total: number } | null;
  wallet: { available: number; lifetime: number };
  streak: number;
  heatmap: HeatmapCell[];
  lessonProgress: LessonProgressRow[];
  examTrend: ExamTrendPoint[];
  activity: ActivityRow[];
  robuxHistory: RobuxHistoryRow[];
  sourceCounts: ReportSourceCounts;
};

function pct(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

function scoreColor(score: number): ExamTrendPoint["color"] {
  if (score >= 80) return "good";
  if (score >= 60) return "warn";
  return "bad";
}

function shortDate(v: unknown): string {
  const iso = toIso(v);
  if (!iso) return "Today";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function buildEnrollmentReport(actor: AuthContext, enrollmentId: string, programKey: string): Promise<EnrollmentReport> {
  const program = await programsRepo.findByKey(programKey);
  const allTopics = [...new Set((await contentRepo.listItems({ programKey })).flatMap((i) => i.standardCodes))];
  const standards = await Promise.all((program?.subjects ?? []).map((subject) => contentRepo.listStandards(programKey, subject)));
  const standardLabels = new Map(standards.flat().map((s) => [s.code, s.description || s.code]));
  const [summary, lessonRows, authoredLessons] = await Promise.all([
    masterySummary(enrollmentId, allTopics),
    lessonProgressRepo.listForEnrollment(enrollmentId),
    lessonsRepo.list(programKey),
  ]);
  const wallet = await walletFor(enrollmentId);
  const stateByCode = new Map(summary.states.map((s) => [s.standardCode, s]));
  const completedLessonByKey = new Map(lessonRows.map((row) => [`${row.subject}:${row.standardCode}`, row]));
  const authoredByKey = new Map<string, (typeof authoredLessons)[number]>();
  for (const lesson of authoredLessons.filter((entry) => entry.status !== "archived")) {
    const key = `${lesson.subject}:${lesson.standardCode}`;
    if (!authoredByKey.has(key)) authoredByKey.set(key, lesson);
  }
  const lessonProgress: LessonProgressRow[] = standards
    .flat()
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.code.localeCompare(b.code))
    .map((standard) => {
      const key = `${standard.subject}:${standard.code}`;
      const completed = completedLessonByKey.get(key);
      const authored = authoredByKey.get(key);
      const masteryState = stateByCode.get(standard.code)?.state ?? "not_started";
      return {
        enrollmentId,
        programKey,
        programTitle: program?.title ?? programKey,
        subject: standard.subject,
        standardCode: standard.code,
        title: authored?.title ?? standard.description ?? standard.code,
        completed: !!completed,
        needsWork: masteryState === "partial" || masteryState === "not_mastered",
        completedAt: toIso(completed?.completedAt) ?? null,
        masteryState,
        source: authored ? "authored" as const : "standard" as const,
      };
    });

  const submitted = await examSessionsRepo.listSubmitted(enrollmentId);
  let latestExam: EnrollmentReport["latestExam"] = null;
  const top = submitted[0];
  if (top && top.result) {
    const r = top.result as ExamResultPayload;
    latestExam = {
      // submittedAt (epoch, set by the state machine) is the reliable timestamp;
      // updatedAt may be unusable depending on how it was persisted.
      at: toIso(top.submittedAt ?? top.updatedAt),
      correct: r.overall.correctCount,
      total: r.overall.total,
      perSubject: r.perSubject.map((s) => ({ subject: s.subject, level: s.level, scale: s.scale, raw: s.raw })),
    };
  }
  const examTrend: ExamTrendPoint[] = submitted
    .slice(0, 5)
    .reverse()
    .map((s, i) => {
      const r = s.result as ExamResultPayload | undefined;
      const score = r ? pct(r.overall.correctCount, r.overall.total) : 0;
      return { label: `E${i + 1}`, score, color: scoreColor(score) };
    });

  const [practice, ledger] = await Promise.all([responsesRepo.listPractice(enrollmentId), robuxLedgerRepo.list(enrollmentId)]);
  const activity: ActivityRow[] = [
    ...submitted.slice(0, 4).map((s) => {
      const r = s.result as ExamResultPayload | undefined;
      const score = r ? pct(r.overall.correctCount, r.overall.total) : 0;
      return {
        date: shortDate(s.submittedAt ?? s.updatedAt),
        type: "Exam" as const,
        detail: `${program?.title ?? programKey} progressive exam`,
        tag: `${score}%`,
        good: score >= 80,
      };
    }),
    ...practice.slice(-4).map((p) => ({
      date: shortDate(p.at),
      type: "Practice" as const,
      detail: p.correct ? "Practice answer correct" : "Practice answer needs review",
      tag: p.correct ? `+${p.awarded}` : "0",
      good: p.correct,
    })),
  ].slice(0, 6);

  const robuxHistory: RobuxHistoryRow[] = ledger.slice(0, 6).map((l) => ({
    desc: `${l.type === "earn" ? "Earned" : l.type === "penalty" ? "Penalty" : "Redeemed"} · ${l.source}`,
    amount: l.type === "earn" ? l.amount : -l.amount,
    type: l.type,
  }));

  let streak = 0;
  try {
    streak = (await getOrCreateSchedule(actor, enrollmentId)).streak;
  } catch {
    streak = 0;
  }

  return {
    enrollmentId,
    programKey,
    programTitle: program?.title ?? programKey,
    topicsCompleted: summary.completed.length,
    topicsTotal: allTopics.length,
    completed: summary.completed,
    remaining: summary.remaining,
    weak: summary.weak,
    circuitBroken: summary.circuitBroken,
    latestExam,
    wallet: { available: wallet.available, lifetime: wallet.lifetimeEarned },
    streak,
    heatmap: allTopics.map((code) => {
      const s = stateByCode.get(code);
      return {
        code,
        label: standardLabels.get(code) ?? code,
        state: s?.state ?? "not_started",
        accuracy: s?.rollingAccuracy ?? 0,
      };
    }),
    lessonProgress,
    examTrend,
    activity,
    robuxHistory,
    sourceCounts: {
      standards: allTopics.length,
      lessonCompletions: lessonRows.length,
      masteryStates: summary.states.length,
      submittedExams: submitted.length,
      practiceResponses: practice.length,
      robuxLedgerEntries: ledger.length,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** All enrollment reports for a student + an overall cross-program rollup. */
export async function studentOverview(actor: AuthContext, studentId: string): Promise<{
  perProgram: EnrollmentReport[];
  overall: { topicsCompleted: number; topicsTotal: number; lifetimeRobux: number; availableRobux: number; sourceCounts: ReportSourceCounts };
}> {
  const enrollments = await enrollmentsRepo.listForStudent(studentId);
  const perProgram: EnrollmentReport[] = [];
  for (const e of enrollments) {
    if (!e._id) continue;
    perProgram.push(await buildEnrollmentReport(actor, e._id, e.programKey));
  }
  return {
    perProgram,
    overall: {
      topicsCompleted: perProgram.reduce((n, r) => n + r.topicsCompleted, 0),
      topicsTotal: perProgram.reduce((n, r) => n + r.topicsTotal, 0),
      lifetimeRobux: perProgram.reduce((n, r) => n + r.wallet.lifetime, 0),
      availableRobux: perProgram.reduce((n, r) => n + r.wallet.available, 0),
      sourceCounts: {
        standards: perProgram.reduce((n, r) => n + r.sourceCounts.standards, 0),
        lessonCompletions: perProgram.reduce((n, r) => n + r.sourceCounts.lessonCompletions, 0),
        masteryStates: perProgram.reduce((n, r) => n + r.sourceCounts.masteryStates, 0),
        submittedExams: perProgram.reduce((n, r) => n + r.sourceCounts.submittedExams, 0),
        practiceResponses: perProgram.reduce((n, r) => n + r.sourceCounts.practiceResponses, 0),
        robuxLedgerEntries: perProgram.reduce((n, r) => n + r.sourceCounts.robuxLedgerEntries, 0),
        generatedAt: new Date().toISOString(),
      },
    },
  };
}
