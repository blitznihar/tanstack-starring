import { describe, it, expect } from "vitest";
import { calculateStreakProgress, evaluateRule, evaluateRules, metRules, type RewardRule } from "~/domain/rewards/rewards.js";

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

describe("effective-date reward semantics", () => {
  const days = [
    { date: "2026-06-28", status: "done" as const },
    { date: "2026-06-29", status: "done" as const },
    { date: "2026-06-30", status: "scheduled" as const },
    { date: "2026-07-01", status: "done" as const },
  ];

  it("RESET streak returns to 0 after a non-excused missed day", () => {
    expect(calculateStreakProgress({ days: days.slice(0, 3), effectiveDate: "2026-06-28", today: "2026-07-01", behavior: "RESET" })).toEqual({ current: 0, paused: false });
    expect(calculateStreakProgress({ days, effectiveDate: "2026-06-28", today: "2026-07-01", behavior: "RESET" })).toEqual({ current: 1, paused: false });
    expect(evaluateRule({
      id: "reset",
      prizeName: "Family trip to Chicago",
      targetType: "STREAK",
      targetValue: 60,
      effectiveDate: "2026-06-28",
      programIds: ["grade3_staar"],
      streakBreakBehavior: "RESET",
      status: "active",
    }, { completed: false, today: "2026-07-01", scheduleDays: days })).toMatchObject({ current: 1, remaining: 59, paused: false });
  });

  it("PAUSE streak holds prior count after a missed day", () => {
    expect(calculateStreakProgress({ days: days.slice(0, 3), effectiveDate: "2026-06-28", today: "2026-07-01", behavior: "PAUSE" })).toEqual({ current: 2, paused: true });
    expect(evaluateRule({
      id: "pause",
      prizeName: "Meta Quest 3 headset",
      targetType: "STREAK",
      targetValue: 60,
      effectiveDate: "2026-06-28",
      programIds: ["grade3_staar"],
      streakBreakBehavior: "PAUSE",
      status: "active",
    }, { completed: false, today: "2026-07-01", scheduleDays: days.slice(0, 3) })).toMatchObject({ current: 2, remaining: 58, paused: true, state: "paused" });
  });

  it("Sick and Off days do not trigger reset or pause", () => {
    const excusedDays = [
      { date: "2026-06-28", status: "done" as const },
      { date: "2026-06-29", status: "sick" as const },
      { date: "2026-06-30", status: "off" as const },
      { date: "2026-07-01", status: "done" as const },
    ];
    expect(calculateStreakProgress({ days: excusedDays, effectiveDate: "2026-06-28", today: "2026-07-01", behavior: "RESET" })).toEqual({ current: 2, paused: false });
    expect(calculateStreakProgress({ days: excusedDays, effectiveDate: "2026-06-28", today: "2026-07-01", behavior: "PAUSE" })).toEqual({ current: 2, paused: false });
  });

  it("COMPLETE_IN_DAYS expires after the effective-date deadline", () => {
    const rule: RewardRule = {
      id: "deadline",
      prizeName: "Meta Quest 3 headset",
      targetType: "COMPLETE_IN_DAYS",
      targetValue: 45,
      effectiveDate: "2026-06-28",
      programIds: ["grade3_staar"],
      status: "active",
    };
    expect(evaluateRule(rule, { completed: false, today: "2026-08-12" })).toMatchObject({ expired: false, daysRemaining: 0 });
    expect(evaluateRule(rule, { completed: false, today: "2026-08-13" })).toMatchObject({ expired: true, state: "expired", daysRemaining: -1 });
  });
});
