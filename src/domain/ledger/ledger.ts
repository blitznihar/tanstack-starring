/**
 * Robux ledger math (pure). Ledger is per enrollment.
 *
 *   availableBalance = lifetimeEarned − penalties − totalFulfilled
 *
 * `lifetimeEarned` is preserved for reporting (never decremented by spending).
 * Negative Robux apply to EXAMS only (not practice); an exam's net award is
 * floored (configurable, default ≥ 0).
 */

export type LedgerEntryType = "earn" | "penalty" | "redeem_fulfilled";

export type LedgerEntry = {
  type: LedgerEntryType;
  /** Positive magnitude for earn; positive magnitude for penalty/redeem (subtracted). */
  amount: number;
  source?: string;
  refId?: string;
};

export type Wallet = {
  lifetimeEarned: number;
  penalties: number;
  totalFulfilled: number;
  available: number;
};

export function computeWallet(entries: LedgerEntry[]): Wallet {
  let lifetimeEarned = 0;
  let penalties = 0;
  let totalFulfilled = 0;
  for (const e of entries) {
    const amt = Math.abs(e.amount);
    if (e.type === "earn") lifetimeEarned += amt;
    else if (e.type === "penalty") penalties += amt;
    else if (e.type === "redeem_fulfilled") totalFulfilled += amt;
  }
  return {
    lifetimeEarned,
    penalties,
    totalFulfilled,
    available: lifetimeEarned - penalties - totalFulfilled,
  };
}

export type ExamAwardInput = {
  correctCount: number;
  wrongCount: number;
  correctQuestionReward: number;
  examMaxReward: number;
  perWrongPenalty: number;
  /** Net award is floored to this value (default 0). */
  floor?: number;
};

export type ExamAward = {
  /** Correct-question reward before the exam max reward cap. */
  gross: number;
  /** Correct-question reward after the exam max reward cap. */
  cappedGross: number;
  /** Negative or zero adjustment applied by the exam max reward cap. */
  capAdjustment: number;
  penalty: number;
  /** Net award after penalty, floored. This is the amount actually credited. */
  net: number;
};

/**
 * Net exam award =
 *   min(correct × correctQuestionReward, examMaxReward)
 *   − (wrong × perWrongPenalty), floored.
 * Returns every component for transparent reports and ledger repair.
 */
export function computeExamAward(input: ExamAwardInput): ExamAward {
  const floor = input.floor ?? 0;
  const gross = input.correctCount * input.correctQuestionReward;
  const cappedGross = Math.min(gross, input.examMaxReward);
  const capAdjustment = cappedGross - gross;
  const penalty = input.wrongCount * input.perWrongPenalty;
  const net = Math.max(floor, cappedGross - penalty);
  return { gross, cappedGross, capAdjustment, penalty, net };
}

export type FulfillInput = {
  amountRequested: number;
  alreadyFulfilled: number;
  available: number;
  /** Amount the admin chooses to fulfill now (supports partial fulfillment). */
  fulfillNow: number;
};

export type FulfillResult = {
  /** Clamped amount actually booked this fulfillment (never exceeds remaining request or available). */
  fulfilled: number;
  /** Total fulfilled across the redemption after this booking. */
  totalFulfilled: number;
  /** Whether the redemption is now fully satisfied. */
  complete: boolean;
};

/**
 * Resolve a (possibly partial) redemption fulfillment. The booked amount is
 * clamped to both the remaining request and the available balance, and is never
 * negative.
 */
export function resolveFulfillment(input: FulfillInput): FulfillResult {
  const remainingRequest = Math.max(0, input.amountRequested - input.alreadyFulfilled);
  const fulfilled = Math.max(0, Math.min(input.fulfillNow, remainingRequest, input.available));
  const totalFulfilled = input.alreadyFulfilled + fulfilled;
  return {
    fulfilled,
    totalFulfilled,
    complete: totalFulfilled >= input.amountRequested,
  };
}
