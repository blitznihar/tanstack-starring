import { toDate } from "~/lib/dates.js";
import type { DemoPolicy, Plan, Subscription } from "~/schemas/billing.js";

/**
 * Pure program-access gating (§12: "gate program access by subscription/demo
 * status"). A program is unlocked if EITHER an active/demo subscription's plan
 * includes it, OR the demo/trial window is active and the demo policy unlocks
 * it. The two sets are unioned.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DemoStatus = {
  active: boolean;
  unlimited: boolean;
  endsAt: Date | null;
  daysLeft: number | null;
};

/** Whether the free trial/demo window is currently open, and when it ends. */
export function demoStatus(input: { now: Date; startedAt: Date | string | number; policy: Pick<DemoPolicy, "lengthDays" | "unlimited"> }): DemoStatus {
  const { now, startedAt, policy } = input;
  if (policy.unlimited) return { active: true, unlimited: true, endsAt: null, daysLeft: null };
  const started = toDate(startedAt);
  // If the trial-start timestamp is unusable, don't punish the user by locking
  // everything — treat the trial as currently open (grace) rather than expired.
  if (!started) return { active: true, unlimited: false, endsAt: null, daysLeft: null };
  const endsAt = new Date(started.getTime() + policy.lengthDays * MS_PER_DAY);
  const msLeft = endsAt.getTime() - now.getTime();
  return {
    active: msLeft > 0,
    unlimited: false,
    endsAt,
    daysLeft: Math.max(0, Math.ceil(msLeft / MS_PER_DAY)),
  };
}

/** A paid/demo subscription grants its plan's programs; "trialing"/"canceled"/"past_due" do not. */
export function isPlanActive(subscription: Subscription | null): boolean {
  return !!subscription && (subscription.status === "active" || subscription.status === "demo");
}

export type ProgramAccessRow = {
  programKey: string;
  unlocked: boolean;
  via: "subscription" | "demo" | null;
};

export type ProgramAccess = {
  demo: DemoStatus;
  planActive: boolean;
  unlockedProgramKeys: string[];
  byProgram: ProgramAccessRow[];
};

export function programAccess(input: {
  now: Date;
  allProgramKeys: string[];
  demoPolicy: DemoPolicy;
  trialStartedAt: Date | string | number;
  subscription: Subscription | null;
  plan: Plan | null;
}): ProgramAccess {
  const { now, allProgramKeys, demoPolicy, trialStartedAt, subscription, plan } = input;
  const demo = demoStatus({ now, startedAt: trialStartedAt, policy: demoPolicy });
  const planActive = isPlanActive(subscription) && !!plan;

  const planKeys = new Set(planActive && plan ? plan.programKeys : []);
  const demoKeys = new Set(demo.active ? demoPolicy.programKeys : []);

  const byProgram: ProgramAccessRow[] = allProgramKeys.map((programKey) => {
    if (planKeys.has(programKey)) return { programKey, unlocked: true, via: "subscription" };
    if (demoKeys.has(programKey)) return { programKey, unlocked: true, via: "demo" };
    return { programKey, unlocked: false, via: null };
  });

  return {
    demo,
    planActive,
    unlockedProgramKeys: byProgram.filter((r) => r.unlocked).map((r) => r.programKey),
    byProgram,
  };
}
