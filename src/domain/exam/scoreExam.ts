import type { Item } from "~/schemas/item.js";
import type { ConversionTable } from "~/schemas/program.js";
import type { PerformanceLevel } from "~/schemas/common.js";
import { scoreItem } from "~/domain/scoring/score.js";
import { convert } from "~/domain/conversion/convert.js";
import { computeExamAward, type ExamAward } from "~/domain/ledger/ledger.js";

/**
 * Score a submitted exam (§8). Deterministic items are scored here; SCR/ECR are
 * flagged `pending` and routed to the async LLM/manual queue (M7) — never blocking
 * submission. Raw → scale → performance level uses the per-subject conversion
 * table (cut points are configurable estimates). Robux net applies the wrong-
 * answer penalty with a floor (§11).
 */

export type ItemResult = {
  itemId: string;
  subject: string;
  correct: boolean;
  earned: number;
  max: number;
  pending: boolean; // scr/ecr awaiting async scoring
};

export type SubjectResult = {
  subject: string;
  correctCount: number;
  wrongCount: number;
  pendingCount: number;
  total: number; // auto-scorable items in the subject
  raw: number; // number correct (drives the conversion table)
  scale: number | null;
  level: PerformanceLevel | null;
};

export type ExamResult = {
  perSubject: SubjectResult[];
  overall: { correctCount: number; wrongCount: number; total: number };
  robux: ExamAward;
  itemResults: ItemResult[];
  pending: boolean; // any item still awaiting async scoring
};

function isAnswered(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export type ScoreExamInput = {
  items: Item[];
  responses: Record<string, unknown>;
  conversionTables: Record<string, ConversionTable | undefined>;
  robuxRules: { examCorrect: number; examWrong: number };
  examFloor?: number;
};

export function scoreExamSession(input: ScoreExamInput): ExamResult {
  const itemResults: ItemResult[] = [];
  const bySubject = new Map<string, SubjectResult>();

  const subjectOf = (s: string): SubjectResult => {
    let r = bySubject.get(s);
    if (!r) {
      r = { subject: s, correctCount: 0, wrongCount: 0, pendingCount: 0, total: 0, raw: 0, scale: null, level: null };
      bySubject.set(s, r);
    }
    return r;
  };

  for (const item of input.items) {
    const resp = input.responses[item._id];
    const scored = scoreItem(item, resp);
    const subj = subjectOf(item.subject);
    const result: ItemResult = {
      itemId: item._id,
      subject: item.subject,
      correct: scored.correct,
      earned: scored.earned,
      max: scored.max,
      pending: scored.requiresAsync,
    };
    itemResults.push(result);

    if (scored.requiresAsync) {
      subj.pendingCount += 1;
      continue;
    }
    subj.total += 1;
    if (scored.correct) subj.correctCount += 1;
    else if (isAnswered(resp)) subj.wrongCount += 1;
  }

  // Convert raw → scale → level per subject.
  for (const r of bySubject.values()) {
    r.raw = r.correctCount;
    const table = input.conversionTables[r.subject];
    if (table) {
      const c = convert(table, r.raw);
      r.scale = c.scale;
      r.level = c.level;
    }
  }

  const perSubject = [...bySubject.values()];
  const correctCount = perSubject.reduce((n, r) => n + r.correctCount, 0);
  const wrongCount = perSubject.reduce((n, r) => n + r.wrongCount, 0);
  const total = perSubject.reduce((n, r) => n + r.total, 0);

  const robux = computeExamAward({
    correctCount,
    wrongCount,
    perCorrect: input.robuxRules.examCorrect,
    perWrongPenalty: input.robuxRules.examWrong,
    floor: input.examFloor ?? 0,
  });

  return {
    perSubject,
    overall: { correctCount, wrongCount, total },
    robux,
    itemResults,
    pending: itemResults.some((r) => r.pending),
  };
}
