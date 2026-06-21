/**
 * Reward rules (§11.B, §20.5) — PURE. Milestone PRIZES (Meta Quest, laptop,
 * vacation), distinct from the per-event Robux earning rules. A rule is evaluated
 * against an enrollment's progress; when met it surfaces for ADMIN fulfillment.
 *
 * Rules can be program-wide and are evaluated from their effectiveDate forward
 * so new prizes never count retroactively.
 */

export type RewardKind = "complete_in_days" | "streak" | "points";
export type RewardTargetType = "STREAK" | "POINTS" | "COMPLETE_IN_DAYS";
export type StreakBreakBehavior = "PAUSE" | "RESET";

export type RewardRule = {
  id: string;
  /** Legacy single-program field. New rules use programIds. */
  programKey?: string;
  studentId?: string; // optional per-student targeting
  /** Legacy fields kept for older stored data and older callers. */
  kind?: RewardKind;
  threshold?: number;
  prize?: string;
  prizeName?: string;
  targetType?: RewardTargetType;
  targetValue?: number;
  effectiveDate?: string; // YYYY-MM-DD
  programIds?: string[];
  streakBreakBehavior?: StreakBreakBehavior;
  status: "active" | "fulfilled" | "archived";
};

export type NormalizedRewardRule = RewardRule & {
  prizeName: string;
  targetType: RewardTargetType;
  targetValue: number;
  effectiveDate: string;
  programIds: string[];
  streakBreakBehavior: StreakBreakBehavior;
  prize: string;
  kind: RewardKind;
  threshold: number;
  programKey: string;
};

export type RewardScheduleDay = {
  date: string;
  status: "scheduled" | "done" | "off" | "sick";
};

export type RewardLedgerEntry = {
  at: Date | string;
  type: "earn" | "penalty" | "redeem_fulfilled";
  amount: number;
};

export type RewardProgress = {
  /** Days taken so far (or to completion). Lower is better for complete_in_days. */
  daysElapsed?: number;
  /** Whether the program is finished. complete_in_days only fires once finished. */
  completed: boolean;
  completedAt?: string | null;
  /** Current streak (sick days already excluded). */
  streak?: number;
  /** Lifetime points/Robux earned. */
  points?: number;
  today?: string;
  scheduleDays?: RewardScheduleDay[];
  ledgerEntries?: RewardLedgerEntry[];
};

export type RewardEvaluation = {
  rule: NormalizedRewardRule;
  met: boolean;
  /** 0..1 progress toward the goal, for the "Big goals & rewards" bar (§20.6). */
  progress: number;
  label: string;
  message: string;
  state: "active" | "earned" | "expired" | "paused";
  current: number;
  remaining: number;
  daysRemaining?: number;
  expired?: boolean;
  paused?: boolean;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayNumber(date: string): number {
  return Math.floor(new Date(date + "T00:00:00Z").getTime() / 86_400_000);
}

function diffDays(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function kindToTargetType(kind?: RewardKind): RewardTargetType {
  if (kind === "points") return "POINTS";
  if (kind === "streak") return "STREAK";
  return "COMPLETE_IN_DAYS";
}

function targetTypeToKind(targetType: RewardTargetType): RewardKind {
  if (targetType === "POINTS") return "points";
  if (targetType === "STREAK") return "streak";
  return "complete_in_days";
}

function positiveInteger(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

export function normalizeRewardRule(rule: RewardRule): NormalizedRewardRule {
  const targetType = rule.targetType ?? kindToTargetType(rule.kind);
  const targetValue = positiveInteger(rule.targetValue ?? rule.threshold, 1);
  const programIds = [...new Set((rule.programIds?.length ? rule.programIds : rule.programKey ? [rule.programKey] : []).filter(Boolean))];
  const programKey = programIds[0] ?? rule.programKey ?? "";
  const prizeName = (rule.prizeName ?? rule.prize ?? "").trim();
  const kind = targetTypeToKind(targetType);
  return {
    ...rule,
    prizeName,
    targetType,
    targetValue,
    effectiveDate: rule.effectiveDate ?? "1970-01-01",
    programIds,
    streakBreakBehavior: rule.streakBreakBehavior ?? "RESET",
    prize: prizeName,
    kind,
    threshold: targetValue,
    programKey,
  };
}

export function calculateStreakProgress(input: {
  days: RewardScheduleDay[];
  effectiveDate: string;
  today: string;
  behavior: StreakBreakBehavior;
}): { current: number; paused: boolean } {
  let current = 0;
  let paused = false;
  for (const day of [...input.days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.date < input.effectiveDate || day.date > input.today) continue;
    if (day.status === "off" || day.status === "sick") continue;
    if (day.status === "done") {
      current += 1;
      paused = false;
      continue;
    }
    if (day.date < input.today) {
      if (input.behavior === "RESET") current = 0;
      paused = input.behavior === "PAUSE";
    }
  }
  return { current, paused };
}

function pointsSinceEffective(rule: NormalizedRewardRule, p: RewardProgress): number {
  if (!p.ledgerEntries) return p.points ?? 0;
  return p.ledgerEntries
    .filter((entry) => entry.type === "earn")
    .filter((entry) => {
      const at = entry.at instanceof Date ? entry.at.toISOString().slice(0, 10) : String(entry.at).slice(0, 10);
      return at >= rule.effectiveDate;
    })
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function evaluateRule(rule: RewardRule, p: RewardProgress): RewardEvaluation {
  const normalized = normalizeRewardRule(rule);
  const today = p.today ?? todayIso();
  switch (normalized.targetType) {
    case "STREAK": {
      const calculated = p.scheduleDays
        ? calculateStreakProgress({ days: p.scheduleDays, effectiveDate: normalized.effectiveDate, today, behavior: normalized.streakBreakBehavior })
        : { current: p.streak ?? 0, paused: false };
      const met = calculated.current >= normalized.targetValue;
      const remaining = Math.max(0, normalized.targetValue - calculated.current);
      return {
        rule: normalized,
        met,
        progress: clamp01(calculated.current / normalized.targetValue),
        label: `${calculated.current} / ${normalized.targetValue}-day streak${calculated.paused ? " · paused" : ""}`,
        message: met
          ? "Earned / ready to claim"
          : calculated.paused
            ? `Paused at ${calculated.current} days. Just ${remaining} days of streak left to earn the ${normalized.prizeName}!`
            : `Just ${remaining} days of streak left to earn the ${normalized.prizeName}!`,
        state: met ? "earned" : calculated.paused ? "paused" : "active",
        current: calculated.current,
        remaining,
        paused: calculated.paused,
      };
    }
    case "POINTS": {
      const points = pointsSinceEffective(normalized, p);
      const met = points >= normalized.targetValue;
      const remaining = Math.max(0, normalized.targetValue - points);
      return {
        rule: normalized,
        met,
        progress: clamp01(points / normalized.targetValue),
        label: `${points} / ${normalized.targetValue} Robux`,
        message: met ? "Earned / ready to claim" : `${remaining} Robux left to earn the ${normalized.prizeName}!`,
        state: met ? "earned" : "active",
        current: points,
        remaining,
      };
    }
    case "COMPLETE_IN_DAYS": {
      if (!rule.effectiveDate && rule.kind === "complete_in_days") {
        const daysElapsed = p.daysElapsed ?? 0;
        const met = p.completed && daysElapsed <= normalized.targetValue;
        return {
          rule: normalized,
          met,
          progress: p.completed ? (met ? 1 : 0) : clamp01(1 - daysElapsed / normalized.targetValue),
          label: p.completed ? `Finished in ${daysElapsed} (≤ ${normalized.targetValue})` : `Day ${daysElapsed} of ${normalized.targetValue}`,
          message: met ? "Earned / ready to claim" : `Only ${Math.max(0, normalized.targetValue - daysElapsed)} days left to claim the ${normalized.prizeName}!`,
          state: met ? "earned" : "active",
          current: daysElapsed,
          remaining: Math.max(0, normalized.targetValue - daysElapsed),
        };
      }
      const deadline = addDays(normalized.effectiveDate, normalized.targetValue);
      const daysRemaining = diffDays(today, deadline);
      const completionDate = p.completedAt ?? (p.completed ? today : null);
      const met = !!completionDate && completionDate <= deadline;
      const expired = !met && daysRemaining < 0;
      const elapsed = Math.max(0, normalized.targetValue - Math.max(0, daysRemaining));
      const remaining = Math.max(0, daysRemaining);
      return {
        rule: normalized,
        met,
        progress: met ? 1 : expired ? 0 : clamp01(elapsed / normalized.targetValue),
        label: met ? `Finished by ${deadline}` : expired ? "Expired" : `${remaining} days left`,
        message: met
          ? "Earned / ready to claim"
          : expired
            ? `${normalized.prizeName} deadline expired`
            : `Only ${remaining} days left to claim the ${normalized.prizeName}!`,
        state: met ? "earned" : expired ? "expired" : "active",
        current: elapsed,
        remaining,
        daysRemaining,
        expired,
      };
    }
  }
}

export function evaluateRules(rules: RewardRule[], p: RewardProgress): RewardEvaluation[] {
  return rules.filter((r) => r.status === "active").map((r) => evaluateRule(r, p));
}

/** Rules that are now met and should surface for admin fulfillment. */
export function metRules(rules: RewardRule[], p: RewardProgress): RewardRule[] {
  return evaluateRules(rules, p).filter((e) => e.met).map((e) => e.rule);
}
