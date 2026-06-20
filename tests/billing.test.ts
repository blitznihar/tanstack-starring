import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { priceForInterval, formatUsd, priceLabel } from "~/domain/billing/pricing.js";
import { demoStatus, isPlanActive, programAccess } from "~/domain/billing/access.js";
import { verifyStripeSignature, parseStripeEvent } from "~/server/billing/stripe.js";
import { DEMO_POLICY_ID, type DemoPolicy, type Plan, type Subscription } from "~/schemas/billing.js";

const familyPlan: Plan = {
  id: "family", name: "Family", priceCents: 1900, features: ["Up to 3 programs"],
  programKeys: ["grade3_staar", "sat"], maxStudents: 4, sortOrder: 1, active: true,
};

function sub(status: Subscription["status"], createdAt: Date, planId: string | null = "family"): Subscription {
  return { accountId: "default", planId, interval: "month", status, currentPeriodEnd: null, createdAt, updatedAt: createdAt };
}
function policy(over: Partial<DemoPolicy> = {}): DemoPolicy {
  return { _id: DEMO_POLICY_ID, lengthDays: 14, unlimited: false, programKeys: ["grade3_staar"], ...over };
}

describe("billing pricing (§12)", () => {
  it("yearly bills 10× the monthly base (2 months free)", () => {
    expect(priceForInterval(3900, "month")).toBe(3900);
    expect(priceForInterval(3900, "year")).toBe(39000);
  });
  it("formats whole dollars without cents, partial with cents", () => {
    expect(formatUsd(3900)).toBe("$39");
    expect(formatUsd(1950)).toBe("$19.50");
  });
  it("labels the interval", () => {
    expect(priceLabel(1900, "month")).toBe("$19/mo");
    expect(priceLabel(1900, "year")).toBe("$190/yr");
  });
});

describe("demoStatus (trial window)", () => {
  const now = new Date("2026-06-19T00:00:00Z");
  it("is active within the window and reports days left", () => {
    const s = demoStatus({ now, startedAt: new Date("2026-06-10T00:00:00Z"), policy: policy() });
    expect(s.active).toBe(true);
    expect(s.daysLeft).toBe(5); // ends 06-24
  });
  it("is expired after the window", () => {
    const s = demoStatus({ now, startedAt: new Date("2026-05-01T00:00:00Z"), policy: policy() });
    expect(s.active).toBe(false);
    expect(s.daysLeft).toBe(0);
  });
  it("is always active when unlimited", () => {
    const s = demoStatus({ now, startedAt: new Date("2000-01-01T00:00:00Z"), policy: policy({ unlimited: true }) });
    expect(s.active).toBe(true);
    expect(s.endsAt).toBeNull();
    expect(s.daysLeft).toBeNull();
  });
});

describe("isPlanActive", () => {
  const d = new Date("2026-06-19T00:00:00Z");
  it("active/demo count; trialing/canceled/past_due do not", () => {
    expect(isPlanActive(sub("active", d))).toBe(true);
    expect(isPlanActive(sub("demo", d))).toBe(true);
    expect(isPlanActive(sub("trialing", d))).toBe(false);
    expect(isPlanActive(sub("canceled", d))).toBe(false);
    expect(isPlanActive(sub("past_due", d))).toBe(false);
    expect(isPlanActive(null)).toBe(false);
  });
});

describe("programAccess gating (§12: subscription OR demo unlocks)", () => {
  const now = new Date("2026-06-19T00:00:00Z");
  const allProgramKeys = ["grade3_staar", "sat", "gre"];

  it("an active subscription unlocks its plan's programs (subscription wins over demo)", () => {
    const a = programAccess({
      now, allProgramKeys, demoPolicy: policy(), trialStartedAt: new Date("2026-06-15T00:00:00Z"),
      subscription: sub("active", new Date("2026-06-15T00:00:00Z")), plan: familyPlan,
    });
    expect(a.unlockedProgramKeys.sort()).toEqual(["grade3_staar", "sat"]);
    expect(a.byProgram.find((r) => r.programKey === "grade3_staar")!.via).toBe("subscription");
    expect(a.byProgram.find((r) => r.programKey === "gre")!.unlocked).toBe(false);
  });

  it("on free trial (no plan), only demo-listed programs unlock, via demo", () => {
    const a = programAccess({
      now, allProgramKeys, demoPolicy: policy({ programKeys: ["grade3_staar"] }),
      trialStartedAt: new Date("2026-06-15T00:00:00Z"), subscription: sub("trialing", new Date("2026-06-15T00:00:00Z"), null), plan: null,
    });
    expect(a.unlockedProgramKeys).toEqual(["grade3_staar"]);
    expect(a.byProgram.find((r) => r.programKey === "grade3_staar")!.via).toBe("demo");
    expect(a.byProgram.find((r) => r.programKey === "sat")!.unlocked).toBe(false);
  });

  it("unions subscription + demo program sets", () => {
    const a = programAccess({
      now, allProgramKeys, demoPolicy: policy({ programKeys: ["gre"] }),
      trialStartedAt: new Date("2026-06-15T00:00:00Z"), subscription: sub("active", new Date("2026-06-15T00:00:00Z")), plan: familyPlan,
    });
    expect(a.unlockedProgramKeys.sort()).toEqual(["grade3_staar", "gre", "sat"]);
    expect(a.byProgram.find((r) => r.programKey === "gre")!.via).toBe("demo");
  });

  it("expired trial + no active plan locks everything", () => {
    const a = programAccess({
      now, allProgramKeys, demoPolicy: policy(), trialStartedAt: new Date("2026-01-01T00:00:00Z"),
      subscription: sub("trialing", new Date("2026-01-01T00:00:00Z"), null), plan: null,
    });
    expect(a.unlockedProgramKeys).toEqual([]);
    expect(a.demo.active).toBe(false);
  });
});

describe("Stripe webhook signature verification (M8 review fix)", () => {
  const secret = "whsec_test_123";
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const t = 1_700_000_000;
  const sign = (ts: number, body: string, sec: string) => createHmac("sha256", sec).update(`${ts}.${body}`).digest("hex");
  const header = (sec: string) => `t=${t},v1=${sign(t, payload, sec)}`;

  it("accepts a correctly signed payload within tolerance", () => {
    expect(verifyStripeSignature(payload, header(secret), secret, { nowSec: t + 10 })).toBe(true);
  });
  it("rejects a tampered payload", () => {
    expect(verifyStripeSignature(payload + "x", header(secret), secret, { nowSec: t + 10 })).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyStripeSignature(payload, header(secret), "whsec_other", { nowSec: t + 10 })).toBe(false);
  });
  it("rejects a stale timestamp beyond tolerance", () => {
    expect(verifyStripeSignature(payload, header(secret), secret, { nowSec: t + 10_000, toleranceSec: 300 })).toBe(false);
  });
  it("rejects a malformed header or empty inputs", () => {
    expect(verifyStripeSignature(payload, "garbage", secret, { nowSec: t })).toBe(false);
    expect(verifyStripeSignature("", "", "", { nowSec: t })).toBe(false);
  });
  it("parses a verified event body", () => {
    expect(parseStripeEvent(payload).type).toBe("checkout.session.completed");
  });
});
