import { richToText } from "~/lib/richText.js";
import { computeExamAward } from "~/domain/ledger/ledger.js";
import type { ExamResult } from "~/domain/exam/scoreExam.js";
import type { Item } from "~/schemas/item.js";

export type ExamDetailQuestion = {
  itemId: string;
  num: number;
  teks: string;
  prompt: string;
  source: string;
  studentAnswer: string;
  correctAnswer: string;
  result: "Correct" | "Incorrect" | "Pending";
  correct: boolean;
  pending: boolean;
  robuxImpact: number;
  whyWrong: string;
  explanation: string;
};

export type ExamDetailSummary = {
  examName: string;
  questionsSolved: number;
  correctCount: number;
  wrongCount: number;
  scorePct: number;
  correctQuestionReward: number;
  examMaxReward: number;
  wrongPenalty: number;
  rawCorrectReward: number;
  cappedCorrectReward: number;
  wrongPenaltyTotal: number;
  capAdjustment: number;
  finalRobux: number;
};

export type ExamDetailReport = {
  sessionId: string;
  examId: string;
  enrollmentId: string;
  studentId: string;
  programTitle: string;
  completedAt: string;
  summary: ExamDetailSummary;
  questions: ExamDetailQuestion[];
};

function isAnswered(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function optionText(item: Item, key: string): string {
  const option = (item.options ?? []).find((entry) => entry.key === key);
  return option ? `${option.key}. ${option.text}` : key;
}

export function answerText(item: Item, selected: unknown): string {
  if (!isAnswered(selected)) return "(blank)";
  if (typeof selected === "string") {
    if (item.type === "multiple_choice" || item.type === "inline_choice") return optionText(item, selected);
    return selected;
  }
  if (Array.isArray(selected)) return selected.map((value) => optionText(item, String(value))).join(", ") || "(blank)";
  if (typeof selected === "object") {
    return Object.entries(selected as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${item.type === "inline_choice" ? optionText(item, String(value)) : String(value ?? "")}`)
      .join("; ") || "(blank)";
  }
  return String(selected);
}

export function correctAnswerText(item: Item): string {
  const opts = item.options ?? [];
  switch (item.type) {
    case "multiple_choice": {
      const option = opts.find((entry) => entry.correct);
      return option ? `${option.key}. ${option.text}` : "";
    }
    case "multiselect":
      return opts.filter((entry) => entry.correct).map((entry) => `${entry.key}. ${entry.text}`).join(", ");
    case "inline_choice": {
      if (item.blanks) {
        const byKey = new Map(opts.map((entry) => [entry.key, entry.text]));
        return Object.values(item.blanks).map((value) => byKey.get(value) ?? value).join(", ");
      }
      return String(item.answer ?? item.correct ?? "");
    }
    case "text_entry":
      return item.blanks ? Object.values(item.blanks).join(", ") : String(item.answer ?? item.correct ?? "");
    case "hot_text": {
      const ids = Array.isArray(item.correct) ? (item.correct as string[]) : item.correct != null ? [String(item.correct)] : [];
      const byId = new Map((item.tokens ?? []).map((entry) => [entry.id, entry.text]));
      return ids.map((id) => `"${byId.get(id) ?? id}"`).join(", ");
    }
    case "multipart":
      return (item.parts ?? [])
        .map((part) => {
          const option = (part.options ?? []).find((entry) => entry.correct);
          return option ? `${part.id.toUpperCase()}: ${option.key}. ${option.text}` : "";
        })
        .filter(Boolean)
        .join("; ");
    case "scr":
    case "ecr":
      return "Teacher-scored written response";
    default:
      return "";
  }
}

export function buildExamDetailReport(input: {
  sessionId: string;
  examId: string;
  enrollmentId: string;
  studentId: string;
  programTitle: string;
  completedAt: Date | number | string | null | undefined;
  itemIds: string[];
  items: Item[];
  responses: Record<string, unknown>;
  result: ExamResult;
  correctQuestionReward: number;
  examMaxReward: number;
  wrongPenalty: number;
  examFloor?: number;
}): ExamDetailReport {
  const itemsById = new Map(input.items.map((item) => [item._id, item]));
  const resultsById = new Map(input.result.itemResults.map((result) => [result.itemId, result]));
  const questionsSolved = input.result.overall.correctCount + input.result.overall.wrongCount;
  const scorePct = questionsSolved > 0 ? Math.round((input.result.overall.correctCount / questionsSolved) * 100) : 0;
  const award = computeExamAward({
    correctCount: input.result.overall.correctCount,
    wrongCount: input.result.overall.wrongCount,
    correctQuestionReward: input.correctQuestionReward,
    examMaxReward: input.examMaxReward,
    perWrongPenalty: input.wrongPenalty,
    floor: input.examFloor ?? 0,
  });
  const completedAt = input.completedAt == null
    ? new Date()
    : input.completedAt instanceof Date
      ? input.completedAt
      : new Date(input.completedAt);

  const questions: ExamDetailQuestion[] = input.itemIds.flatMap((itemId, index) => {
    const item = itemsById.get(itemId);
    const itemResult = resultsById.get(itemId);
    if (!item || !itemResult) return [];
    const response = input.responses[itemId];
    const answered = isAnswered(response);
    const selectedKey = typeof response === "string" ? response : "";
    const selectedOption = (item.options ?? []).find((option) => option.key === selectedKey);
    const robuxImpact = itemResult.pending
      ? 0
      : itemResult.correct
        ? input.correctQuestionReward
        : answered
          ? -input.wrongPenalty
          : 0;
    return [{
      itemId,
      num: index + 1,
      teks: item.standardCodes.map((code) => `TEKS ${code}`).join(", "),
      prompt: richToText(item.prompt),
      source: item.source ?? "generated",
      studentAnswer: answerText(item, response),
      correctAnswer: correctAnswerText(item),
      result: itemResult.pending ? "Pending" : itemResult.correct ? "Correct" : "Incorrect",
      correct: itemResult.correct,
      pending: itemResult.pending,
      robuxImpact,
      whyWrong: !itemResult.correct && selectedOption ? selectedOption.rationale ?? "" : "",
      explanation: richToText(item.workedSolution) || richToText(item.explanation),
    }];
  });

  return {
    sessionId: input.sessionId,
    examId: input.examId,
    enrollmentId: input.enrollmentId,
    studentId: input.studentId,
    programTitle: input.programTitle,
    completedAt: completedAt.toISOString(),
    summary: {
      examName: input.programTitle,
      questionsSolved,
      correctCount: input.result.overall.correctCount,
      wrongCount: input.result.overall.wrongCount,
      scorePct,
      correctQuestionReward: input.correctQuestionReward,
      examMaxReward: input.examMaxReward,
      wrongPenalty: input.wrongPenalty,
      rawCorrectReward: award.gross,
      cappedCorrectReward: award.cappedGross,
      wrongPenaltyTotal: award.penalty,
      capAdjustment: award.capAdjustment,
      finalRobux: award.net,
    },
    questions,
  };
}
