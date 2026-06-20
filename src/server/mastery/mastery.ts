import { masteryRepo } from "~/repositories/masteryStates.js";
import { updateMastery, weakTopics, completedVsRemaining, circuitBrokenTopics, type MasteryState } from "~/domain/mastery/mastery.js";

/**
 * Record a graded attempt against every standard the item assesses, folding it
 * into the per-enrollment mastery state (§9). Called from practice + exam scoring.
 */
export async function recordAttempt(enrollmentId: string, standardCodes: string[], correct: boolean): Promise<void> {
  for (const code of standardCodes) {
    const prev = await masteryRepo.get(enrollmentId, code);
    const next = updateMastery(prev ?? undefined, code, correct);
    await masteryRepo.save(enrollmentId, next);
  }
}

export async function getMastery(enrollmentId: string): Promise<MasteryState[]> {
  return masteryRepo.list(enrollmentId);
}

/** Completed/weak/circuit-broken topics for assembly + reporting. */
export async function masterySummary(
  enrollmentId: string,
  allStandardCodes: string[],
): Promise<{ completed: string[]; remaining: string[]; weak: string[]; circuitBroken: string[]; states: MasteryState[] }> {
  const states = await masteryRepo.list(enrollmentId);
  const { completed, remaining } = completedVsRemaining(states, allStandardCodes);
  return { completed, remaining, weak: weakTopics(states), circuitBroken: circuitBrokenTopics(states), states };
}
