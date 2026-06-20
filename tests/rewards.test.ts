import { describe, it, expect } from "vitest";
import { evaluateRule, evaluateRules, metRules, type RewardRule } from "~/domain/rewards/rewards.js";

const base = { programKey: "grade3_staar", status: "active" as const };

describe("evaluateRule", () => {
  it("streak rule met at/over threshold with progress bar", () => {
    const rule: RewardRule = { id: "1", ...base, kind: "streak", threshold: 20, prize: "Chicago trip" };
    expect(evaluateRule(rule, { daysElapsed: 5, completed: false, streak: 10, points: 0 })).toMatchObject({ met: false, progress: 0.5 });
    expect(evaluateRule(rule, { daysElapsed: 5, completed: false, streak: 20, points: 0 }).met).toBe(true);
  });

  it("points rule met at/over threshold", () => {
    const rule: RewardRule = { id: "2", ...base, kind: "points", threshold: 1000, prize: "Lego set" };
    expect(evaluateRule(rule, { daysElapsed: 0, completed: false, streak: 0, points: 500 }).progress).toBe(0.5);
    expect(evaluateRule(rule, { daysElapsed: 0, completed: false, streak: 0, points: 1200 }).met).toBe(true);
  });

  it("complete_in_days fires only when finished within the day budget", () => {
    const rule: RewardRule = { id: "3", ...base, kind: "complete_in_days", threshold: 45, prize: "Meta Quest" };
    expect(evaluateRule(rule, { daysElapsed: 40, completed: false, streak: 0, points: 0 }).met).toBe(false);
    expect(evaluateRule(rule, { daysElapsed: 40, completed: true, streak: 0, points: 0 }).met).toBe(true);
    expect(evaluateRule(rule, { daysElapsed: 50, completed: true, streak: 0, points: 0 }).met).toBe(false); // over budget
  });
});

describe("evaluateRules / metRules", () => {
  const rules: RewardRule[] = [
    { id: "1", ...base, kind: "streak", threshold: 20, prize: "Trip" },
    { id: "2", ...base, kind: "points", threshold: 1000, prize: "Lego" },
    { id: "3", ...base, kind: "streak", threshold: 30, prize: "Bike", status: "archived" },
  ];
  it("ignores non-active rules", () => {
    expect(evaluateRules(rules, { daysElapsed: 0, completed: false, streak: 25, points: 1100 })).toHaveLength(2);
  });
  it("returns the met rules for fulfillment", () => {
    const met = metRules(rules, { daysElapsed: 0, completed: false, streak: 25, points: 1100 });
    expect(met.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });
});
