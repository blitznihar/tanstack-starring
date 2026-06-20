import type { Item } from "~/schemas/item.js";
import type { ConceptConfig } from "~/schemas/program.js";

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

/** "Earn up to N Robux" for a set (scorable count × per-correct value). §20.6 */
export function earnUpTo(shownCount: number, perCorrect: number): number {
  return shownCount * perCorrect;
}

/**
 * Robux awarded for a practice answer. Idempotent: an already-awarded item yields
 * 0. Practice never applies negative Robux (penalties are exam-only — §11).
 */
export function practiceAward(isCorrect: boolean, alreadyAwarded: boolean, perCorrect: number): number {
  if (alreadyAwarded) return 0;
  return isCorrect ? perCorrect : 0;
}
