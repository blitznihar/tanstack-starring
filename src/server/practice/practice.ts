import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { contentRepo } from "~/repositories/content.js";
import { passagesRepo } from "~/repositories/passages.js";
import { itemUsageRepo } from "~/repositories/itemUsage.js";
import { responsesRepo } from "~/repositories/responses.js";
import { robuxLedgerRepo } from "~/repositories/robuxLedger.js";
import { scoreItem } from "~/domain/scoring/score.js";
import { assemblePractice, earnUpTo, practiceAward } from "~/domain/practice/practice.js";
import { walletFor } from "~/server/gamification/wallet.js";
import { recordAttempt } from "~/server/mastery/mastery.js";
import { richToText } from "~/lib/richText.js";
import type { AuthContext } from "~/server/auth/session.js";
import type { Item } from "~/schemas/item.js";
import type { Passage } from "~/schemas/passage.js";

function assertOwner(actor: AuthContext, enrollment: { studentId: string } | null): void {
  if (!enrollment) throw new Error("Enrollment not found");
  const isOwner = actor.userId === enrollment.studentId;
  const isAdmin = actor.roles.includes("admin") || actor.roles.includes("super_admin");
  if (!isOwner && !isAdmin) throw new Error("Forbidden: not your enrollment");
}

type PracticePassage = { id: string; title: string; genre: string; level: string | null; paragraphs: string[] };

export type PracticeQuestion = {
  itemId: string;
  num: number;
  teks: string;
  type: string;
  prompt: string;
  passage: PracticePassage | null;
  // NB: correct flag + rationale are intentionally NOT sent (revealed only after submit).
  options: { key: string; text: string }[];
  blankIds: string[];
  tokens: { id: string; text: string }[];
};

export type PracticeSet = {
  subject: string;
  shownCount: number;
  bankTotal: number;
  perCorrect: number;
  earnUpTo: number;
  questions: PracticeQuestion[];
};

function passageView(passage: Passage | null | undefined): PracticePassage | null {
  if (!passage) return null;
  return {
    id: passage.id,
    title: passage.title,
    genre: passage.genre,
    level: passage.level ?? null,
    paragraphs: passage.body.map((n) => (typeof n === "string" ? n : n.text ?? "")).filter(Boolean),
  };
}

/** Concept display order for a subject: program.conceptConfig keys that exist in the bank. */
function subjectOrder(bank: Item[], configKeys: string[]): string[] {
  const present = new Set(bank.flatMap((i) => i.standardCodes));
  return configKeys.filter((k) => present.has(k));
}

export async function getPracticeSet(
  actor: AuthContext,
  input: { enrollmentId: string; subject: string },
): Promise<PracticeSet> {
  const enrollment = await enrollmentsRepo.findById(input.enrollmentId);
  assertOwner(actor, enrollment);
  const program = await programsRepo.findByKey(enrollment!.programKey);
  if (!program) throw new Error("Program not found");

  const bank = await contentRepo.listItems({ programKey: enrollment!.programKey, subject: input.subject });
  const usedIds = await itemUsageRepo.usedItemIds(input.enrollmentId);
  const order = subjectOrder(bank, Object.keys(program.conceptConfig));
  const assembled = assemblePractice(bank, usedIds, program.conceptConfig, order);
  const perCorrect = program.robuxRules.practiceCorrect;

  // Resolve any referenced reading passages once (RLA).
  const passages = await passagesRepo.list(enrollment!.programKey, input.subject);
  const passageById = new Map(passages.map((pg) => [pg.id, pg]));

  return {
    subject: input.subject,
    shownCount: assembled.shownCount,
    bankTotal: assembled.bankTotal,
    perCorrect,
    earnUpTo: earnUpTo(assembled.shownCount, perCorrect),
    questions: assembled.questions.map((it, i) => ({
      itemId: it._id,
      num: i + 1,
      teks: it.standardCodes.map((c) => `TEKS ${c}`).join(", "),
      type: it.type,
      prompt: richToText(it.prompt),
      passage: it.passageRef ? passageView(passageById.get(it.passageRef)) : null,
      options: (it.options ?? []).map((o) => ({ key: o.key, text: o.text })),
      blankIds: it.blanks ? Object.keys(it.blanks) : [],
      tokens: (it.tokens ?? []).map((t) => ({ id: t.id, text: t.text })),
    })),
  };
}

export type PracticeFeedback = {
  correct: boolean;
  awarded: number;
  perCorrect: number;
  /** Option keys (MC/multiselect) for post-submit coloring. Empty for other types. */
  correctKeys: string[];
  selectedKeys: string[];
  /** A readable correct answer for every item type (revealed only after submit). */
  correctText: string;
  whyRightLabel: string;
  whyRight: string;
  whyWrongLabel: string;
  whyWrong: string;
  wallet: { available: number; lifetime: number };
};

/** A human-readable "correct answer" for any auto-scorable item type. */
function correctAnswerText(item: Item): string {
  const opts = item.options ?? [];
  switch (item.type) {
    case "multiple_choice": {
      const o = opts.find((x) => x.correct);
      return o ? `${o.key}. ${o.text}` : "";
    }
    case "multiselect":
      return opts.filter((o) => o.correct).map((o) => o.text).join(", ");
    case "inline_choice": {
      // blanks holds option KEYS — show the option TEXT for each blank.
      if (item.blanks) {
        const byKey = new Map(opts.map((o) => [o.key, o.text]));
        return Object.values(item.blanks).map((v) => byKey.get(v) ?? v).join(", ");
      }
      return String(item.answer ?? item.correct ?? "");
    }
    case "text_entry":
      return item.blanks ? Object.values(item.blanks).join(", ") : String(item.answer ?? item.correct ?? "");
    case "hot_text": {
      const ids = Array.isArray(item.correct) ? (item.correct as string[]) : item.correct != null ? [String(item.correct)] : [];
      const byId = new Map((item.tokens ?? []).map((t) => [t.id, t.text]));
      return ids.map((id) => `“${byId.get(id) ?? id}”`).join(", ");
    }
    default:
      return "";
  }
}

function keysOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return v ? [v] : [];
  return [];
}

function buildFeedback(
  item: Item,
  selected: unknown,
  correct: boolean,
  awarded: number,
  perCorrect: number,
  wallet: { available: number; lifetimeEarned: number },
): PracticeFeedback {
  const opts = item.options ?? [];
  const isOptionType = item.type === "multiple_choice" || item.type === "multiselect";
  const correctOpt = item.type === "multiple_choice" ? opts.find((o) => o.correct) : undefined;
  const selKey = item.type === "multiple_choice" && typeof selected === "string" ? selected : "";
  const selOpt = opts.find((o) => o.key === selKey);
  return {
    correct,
    awarded,
    perCorrect,
    correctKeys: isOptionType ? opts.filter((o) => o.correct).map((o) => o.key) : [],
    selectedKeys: isOptionType ? keysOf(selected) : [],
    correctText: correctAnswerText(item),
    whyRightLabel: correctOpt ? `Why ${correctOpt.key} (${correctOpt.text}) is right` : "Why this is right",
    whyRight: richToText(item.explanation),
    whyWrongLabel: selOpt && !correct ? `Why ${selOpt.key} (${selOpt.text}) isn't right` : "",
    whyWrong: selOpt && !correct ? (selOpt.rationale ?? "") : "",
    wallet: { available: wallet.available, lifetime: wallet.lifetimeEarned },
  };
}

export async function submitPracticeAnswer(
  actor: AuthContext,
  input: { enrollmentId: string; itemId: string; selected: unknown },
): Promise<PracticeFeedback> {
  const enrollment = await enrollmentsRepo.findById(input.enrollmentId);
  assertOwner(actor, enrollment);
  const item = await contentRepo.findItem(input.itemId);
  if (!item || item.programKey !== enrollment!.programKey) throw new Error("Item not in this enrollment's program");
  // Written items are never practiced (no instant scoring) — guard against misuse.
  if (item.type === "scr" || item.type === "ecr") throw new Error("Written items are exam-only");
  const program = await programsRepo.findByKey(enrollment!.programKey);
  const perCorrect = program?.robuxRules.practiceCorrect ?? 0;

  // Idempotent: a prior practice response means no re-award (§20.6).
  const prior = await responsesRepo.findPractice(input.enrollmentId, input.itemId);
  if (prior) {
    const wallet = await walletFor(input.enrollmentId);
    return buildFeedback(item, prior.selected, prior.correct, 0, perCorrect, wallet);
  }

  const result = scoreItem(item, input.selected);
  const awarded = practiceAward(result.correct, false, perCorrect);
  const resp = await responsesRepo.insertPractice({
    enrollmentId: input.enrollmentId,
    itemId: input.itemId,
    selected: input.selected,
    correct: result.correct,
    earned: result.earned,
    awarded,
  });

  // Lost a race — fall back to the now-existing response (no double award).
  if (!resp) {
    const wallet = await walletFor(input.enrollmentId);
    return buildFeedback(item, input.selected, result.correct, 0, perCorrect, wallet);
  }

  await itemUsageRepo.record(input.enrollmentId, input.itemId, "practice");
  await recordAttempt(input.enrollmentId, item.standardCodes, result.correct);
  if (awarded > 0) {
    await robuxLedgerRepo.add({
      enrollmentId: input.enrollmentId,
      type: "earn",
      amount: awarded,
      source: "practice",
      refId: input.itemId,
    });
  }

  const wallet = await walletFor(input.enrollmentId);
  return buildFeedback(item, input.selected, result.correct, awarded, perCorrect, wallet);
}
