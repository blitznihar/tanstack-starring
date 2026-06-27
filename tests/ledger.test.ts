import { describe, it, expect } from "vitest";
import {
  computeWallet,
  computeExamAward,
  resolveFulfillment,
} from "~/domain/ledger/ledger.js";

describe("computeWallet", () => {
  it("available = lifetimeEarned − penalties − totalFulfilled, preserving lifetime", () => {
    const w = computeWallet([
      { type: "earn", amount: 1000 },
      { type: "earn", amount: 840 },
      { type: "penalty", amount: 30 },
      { type: "redeem_fulfilled", amount: 300 },
    ]);
    expect(w.lifetimeEarned).toBe(1840);
    expect(w.penalties).toBe(30);
    expect(w.totalFulfilled).toBe(300);
    expect(w.available).toBe(1510);
  });
});

describe("computeExamAward — negative Robux + floor", () => {
  it("subtracts wrong-answer penalties from gross", () => {
    expect(computeExamAward({ correctCount: 8, wrongCount: 2, correctQuestionReward: 20, examMaxReward: 400, perWrongPenalty: 10 })).toEqual({
      gross: 160,
      cappedGross: 160,
      capAdjustment: 0,
      penalty: 20,
      net: 140,
    });
  });
  it("caps the positive correct-question reward at the exam max reward", () => {
    expect(computeExamAward({ correctCount: 85, wrongCount: 0, correctQuestionReward: 5, examMaxReward: 400, perWrongPenalty: 5 })).toEqual({
      gross: 425,
      cappedGross: 400,
      capAdjustment: -25,
      penalty: 0,
      net: 400,
    });
  });
  it("does not treat the exam max reward as a per-question reward", () => {
    const result = computeExamAward({ correctCount: 57, wrongCount: 18, correctQuestionReward: 5, examMaxReward: 400, perWrongPenalty: 5 });
    expect(result.net).toBe(195);
    expect(result.net).not.toBe(22710);
  });
  it("floors the net award (default 0)", () => {
    expect(computeExamAward({ correctCount: 1, wrongCount: 10, correctQuestionReward: 20, examMaxReward: 400, perWrongPenalty: 10 }).net).toBe(0);
  });
  it("respects a configurable floor", () => {
    expect(
      computeExamAward({ correctCount: 0, wrongCount: 5, correctQuestionReward: 20, examMaxReward: 400, perWrongPenalty: 10, floor: 25 }).net,
    ).toBe(25);
  });
  it("can preserve negative exam penalties when the caller allows negative nets", () => {
    expect(
      computeExamAward({ correctCount: 0, wrongCount: 10, correctQuestionReward: 5, examMaxReward: 400, perWrongPenalty: 5, floor: Number.NEGATIVE_INFINITY }).net,
    ).toBe(-50);
  });
});

describe("resolveFulfillment — partial fulfillment", () => {
  it("books a partial amount and reports incomplete", () => {
    const r = resolveFulfillment({ amountRequested: 1000, alreadyFulfilled: 0, available: 1000, fulfillNow: 400 });
    expect(r).toEqual({ fulfilled: 400, totalFulfilled: 400, complete: false });
  });
  it("completes when the rest is fulfilled", () => {
    const r = resolveFulfillment({ amountRequested: 1000, alreadyFulfilled: 400, available: 600, fulfillNow: 600 });
    expect(r).toEqual({ fulfilled: 600, totalFulfilled: 1000, complete: true });
  });
  it("clamps to available balance", () => {
    const r = resolveFulfillment({ amountRequested: 1000, alreadyFulfilled: 0, available: 150, fulfillNow: 1000 });
    expect(r.fulfilled).toBe(150);
    expect(r.complete).toBe(false);
  });
  it("never books a negative amount", () => {
    const r = resolveFulfillment({ amountRequested: 100, alreadyFulfilled: 100, available: 500, fulfillNow: 50 });
    expect(r.fulfilled).toBe(0);
    expect(r.complete).toBe(true);
  });
});
