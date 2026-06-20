/**
 * Mastery & remediation (§9) — PURE, rule-based, per enrollment per TEKS.
 *
 * Each attempt updates a rolling accuracy (EMA) and a stuck counter. State is
 * derived from rolling accuracy. After ~3 consecutive not_mastered outcomes the
 * circuit-breaker trips: switch representation + flag the adult.
 */

export type MasteryLevel = "mastered" | "partial" | "not_mastered";

export type MasteryState = {
  standardCode: string;
  state: MasteryLevel;
  rollingAccuracy: number; // 0..1
  attempts: number;
  stuckCount: number; // consecutive not_mastered attempts
  circuitBroken: boolean; // remediation trigger (§9 circuit-breaker)
};

const ALPHA = 0.4; // EMA weight on the newest attempt
const MASTERED_AT = 0.8;
const PARTIAL_AT = 0.5;
const CIRCUIT_BREAK_AT = 3;

export function classify(accuracy: number): MasteryLevel {
  if (accuracy >= MASTERED_AT) return "mastered";
  if (accuracy >= PARTIAL_AT) return "partial";
  return "not_mastered";
}

export function initialMastery(standardCode: string): MasteryState {
  return { standardCode, state: "not_mastered", rollingAccuracy: 0, attempts: 0, stuckCount: 0, circuitBroken: false };
}

/** Fold one graded attempt into the mastery state. */
export function updateMastery(prev: MasteryState | undefined, standardCode: string, correct: boolean): MasteryState {
  const base = prev ?? initialMastery(standardCode);
  const point = correct ? 1 : 0;
  const rollingAccuracy = base.attempts === 0 ? point : ALPHA * point + (1 - ALPHA) * base.rollingAccuracy;
  const state = classify(rollingAccuracy);
  // stuckCount: rises on a not-mastered miss, resets the moment the student is no longer not_mastered.
  const stuckCount = state === "not_mastered" ? base.stuckCount + (correct ? 0 : 1) : 0;
  return {
    standardCode,
    state,
    rollingAccuracy,
    attempts: base.attempts + 1,
    stuckCount,
    circuitBroken: stuckCount >= CIRCUIT_BREAK_AT,
  };
}

/** Topics the exam assembler should weight toward (partial or worse). */
export function weakTopics(states: MasteryState[]): string[] {
  return states.filter((s) => s.state !== "mastered").map((s) => s.standardCode);
}

/** Completed (mastered) vs remaining, given the full set of standard codes. */
export function completedVsRemaining(
  states: MasteryState[],
  allStandardCodes: string[],
): { completed: string[]; remaining: string[] } {
  const mastered = new Set(states.filter((s) => s.state === "mastered").map((s) => s.standardCode));
  return {
    completed: allStandardCodes.filter((c) => mastered.has(c)),
    remaining: allStandardCodes.filter((c) => !mastered.has(c)),
  };
}

/** Standards that have tripped the circuit-breaker (need representation switch + adult alert). */
export function circuitBrokenTopics(states: MasteryState[]): string[] {
  return states.filter((s) => s.circuitBroken).map((s) => s.standardCode);
}
