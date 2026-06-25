import type { Item } from "~/schemas/item.js";
import type { ConceptConfig } from "~/schemas/program.js";
import { richToText } from "~/lib/richText.js";

/**
 * Practice assembly (§6, §20.6). The day's practice draws UNUSED items (no
 * repeats), up to the per-concept configured count, across the subject's
 * concepts. Reports "Showing X today · Y in the bank".
 */

export type AssembledPractice = {
  questions: Item[];
  shownCount: number;
  bankTotal: number;
  unusedTotal: number;
};

export type FocusedPracticeSlot = {
  item: Item;
  practiceItemId: string;
  sourceItemId: string;
  standardCode: string;
  kind: "focus" | "review";
};

const PRACTICE_ID_MARKER = "::practice:";

export function sourceItemIdFromPracticeId(itemId: string): string {
  return itemId.includes(PRACTICE_ID_MARKER) ? itemId.slice(0, itemId.indexOf(PRACTICE_ID_MARKER)) : itemId;
}

function practiceInstanceId(item: Item, standardCode: string, kind: "focus" | "review", slot: number, focusStandard = standardCode): string {
  const context = kind === "review" ? `${focusStandard}:` : "";
  return `${item._id}${PRACTICE_ID_MARKER}${kind}:${context}${standardCode}:${slot}`;
}

function normalizePracticeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function practiceQuestionKey(item: Item, standardCode = item.standardCodes[0] ?? ""): string {
  const options = (item.options ?? []).map((option) => `${option.key}:${normalizePracticeText(option.text)}`).join("|");
  const parts = (item.parts ?? []).map((part) => {
    const partOptions = (part.options ?? []).map((option) => `${option.key}:${normalizePracticeText(option.text)}`).join("|");
    return `${part.id}:${normalizePracticeText(richToText(part.prompt))}:${partOptions}`;
  }).join("|");
  const tokens = (item.tokens ?? []).map((token) => `${token.id}:${normalizePracticeText(token.text)}`).join("|");
  return [
    standardCode,
    item.passageRef ?? "",
    item.type,
    normalizePracticeText(richToText(item.prompt)),
    options,
    parts,
    tokens,
  ].join("\u001f");
}

/**
 * @param bank      all items for the subject
 * @param usedIds   item ids already shown to this enrollment (no-repeat)
 * @param config    per-concept { q, m }
 * @param order     concept codes in display order (defaults to config key order)
 */
export function assemblePractice(
  bank: Item[],
  usedIds: Set<string>,
  config: ConceptConfig,
  order?: string[],
): AssembledPractice {
  const codes = order ?? Object.keys(config);
  const seen = new Set<string>();
  const questions: Item[] = [];

  // Practice gives INSTANT why-right/why-wrong feedback, so it draws only
  // auto-scorable items. Written SCR/ECR are exam-only (scored async by the model).
  const practiceable = bank.filter((it) => it.type !== "scr" && it.type !== "ecr");

  for (const code of codes) {
    const want = config[code]?.q ?? 0;
    if (want <= 0) continue;
    const pool = practiceable.filter((it) => it.standardCodes.includes(code) && !usedIds.has(it._id) && !seen.has(it._id));
    for (const item of pool.slice(0, want)) {
      questions.push(item);
      seen.add(item._id);
    }
  }

  const unusedTotal = practiceable.filter((it) => !usedIds.has(it._id)).length;
  return { questions, shownCount: questions.length, bankTotal: practiceable.length, unusedTotal };
}

function practiceableItems(bank: Item[]): Item[] {
  return bank.filter((it) => it.type !== "scr" && it.type !== "ecr");
}

function cycleTopic(
  pool: Item[],
  standardCode: string,
  kind: "focus" | "review",
  count: number,
  startSlot = 1,
  focusStandard = standardCode,
): FocusedPracticeSlot[] {
  if (count <= 0 || pool.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const item = pool[index % pool.length]!;
    const slot = startSlot + index;
    return {
      item,
      practiceItemId: practiceInstanceId(item, standardCode, kind, slot, focusStandard),
      sourceItemId: item._id,
      standardCode,
      kind,
    };
  });
}

function uniqueTopic(
  pool: Item[],
  standardCode: string,
  kind: "focus" | "review",
  count: number,
  startSlot = 1,
  seenKeys = new Set<string>(),
  focusStandard = standardCode,
): FocusedPracticeSlot[] {
  if (count <= 0 || pool.length === 0) return [];
  const slots: FocusedPracticeSlot[] = [];
  for (const item of pool) {
    if (slots.length >= count) break;
    const key = practiceQuestionKey(item, standardCode);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const slot = startSlot + slots.length;
    slots.push({
      item,
      practiceItemId: practiceInstanceId(item, standardCode, kind, slot, focusStandard),
      sourceItemId: item._id,
      standardCode,
      kind,
    });
  }
  return slots;
}

/**
 * Lesson-gated practice: after a lesson, give a substantial focused set for the
 * just-completed topic, plus a small spaced-review tail from older lessons.
 *
 * The content bank may only contain a few authored items for a TEKS. When that
 * happens, stable virtual practice IDs let the app show a 20-question session and
 * score/report each slot separately while still using the original item key.
 */
export function assembleFocusedPractice(
  bank: Item[],
  focusStandard: string,
  previousStandards: string[],
  options: { focusCount?: number; reviewCount?: number; reviewPerStandard?: number; allowRepeats?: boolean } = {},
): { slots: FocusedPracticeSlot[]; bankTotal: number } {
  const practiceable = practiceableItems(bank);
  const focusCount = options.focusCount ?? 20;
  const reviewCount = options.reviewCount ?? 5;
  const reviewPerStandard = options.reviewPerStandard ?? 2;
  const allowRepeats = options.allowRepeats ?? true;
  const byStandard = (code: string) => practiceable.filter((item) => item.standardCodes.includes(code));
  const seenKeys = new Set<string>();
  const topicSlots = (
    pool: Item[],
    standardCode: string,
    kind: "focus" | "review",
    count: number,
    startSlot = 1,
  ) => allowRepeats
    ? cycleTopic(pool, standardCode, kind, count, startSlot, focusStandard)
    : uniqueTopic(pool, standardCode, kind, count, startSlot, seenKeys, focusStandard);

  const focus = topicSlots(byStandard(focusStandard), focusStandard, "focus", focusCount);
  const review: FocusedPracticeSlot[] = [];
  const prior = previousStandards.filter((code) => code !== focusStandard);
  let reviewSlot = 1;
  for (const code of prior) {
    if (review.length >= reviewCount) break;
    const take = Math.min(reviewPerStandard, reviewCount - review.length);
    const slots = topicSlots(byStandard(code), code, "review", take, reviewSlot);
    review.push(...slots);
    reviewSlot += slots.length;
  }

  return { slots: [...focus, ...review], bankTotal: practiceable.length };
}

/** "Earn up to N Robux" for a set (scorable count × per-correct value). §20.6 */
export function earnUpTo(shownCount: number, perCorrect: number): number {
  return shownCount * perCorrect;
}

/**
 * Robux delta for a practice answer. Idempotent: an already-awarded item yields
 * 0. Fresh wrong practice answers apply the configured practice penalty.
 */
export function practiceAward(isCorrect: boolean, alreadyAwarded: boolean, perCorrect: number, wrongPenalty = perCorrect): number {
  if (alreadyAwarded) return 0;
  return isCorrect ? perCorrect : -wrongPenalty;
}
