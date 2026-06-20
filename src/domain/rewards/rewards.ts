/**
 * Reward rules (§11.B, §20.5) — PURE. Milestone PRIZES (Meta Quest, laptop,
 * vacation), distinct from the per-event Robux earning rules. A rule is evaluated
 * against an enrollment's progress; when met it surfaces for ADMIN fulfillment.
 *
 * Sick days are excluded from streak counting upstream (§10), so the streak value
 * passed here already honors that.
 */

export type RewardKind = "complete_in_days" | "streak" | "points";

export type RewardRule = {
  id: string;
  programKey: string;
  studentId?: string; // optional per-student targeting
  kind: RewardKind;
  threshold: number;
  prize: string;
  status: "active" | "fulfilled" | "archived";
};

export type RewardProgress = {
  /** Days taken so far (or to completion). Lower is better for complete_in_days. */
  daysElapsed: number;
  /** Whether the program is finished. complete_in_days only fires once finished. */
  completed: boolean;
  /** Current streak (sick days already excluded). */
  streak: number;
  /** Lifetime points/Robux earned. */
  points: number;
};

export type RewardEvaluation = {
  rule: RewardRule;
  met: boolean;
  /** 0..1 progress toward the goal, for the "Big goals & rewards" bar (§20.6). */
  progress: number;
  label: string;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function evaluateRule(rule: RewardRule, p: RewardProgress): RewardEvaluation {
  switch (rule.kind) {
    case "streak": {
      return {
        rule,
        met: p.streak >= rule.threshold,
        progress: clamp01(p.streak / rule.threshold),
        label: `${p.streak} / ${rule.threshold}-day streak`,
      };
    }
    case "points": {
      return {
        rule,
        met: p.points >= rule.threshold,
        progress: clamp01(p.points / rule.threshold),
        label: `${p.points} / ${rule.threshold} Robux`,
      };
    }
    case "complete_in_days": {
      // Met only when the program is finished within the day budget.
      const met = p.completed && p.daysElapsed <= rule.threshold;
      // While in progress, show how close to finishing within budget (by days used).
      const progress = p.completed ? (met ? 1 : 0) : clamp01(1 - p.daysElapsed / rule.threshold);
      return {
        rule,
        met,
        progress,
        label: p.completed ? `Finished in ${p.daysElapsed} (≤ ${rule.threshold})` : `Day ${p.daysElapsed} of ${rule.threshold}`,
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
