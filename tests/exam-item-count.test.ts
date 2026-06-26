import { describe, expect, it } from "vitest";
import { minimumItemsForExam, resolveExamTotalItems } from "~/domain/exam/itemCount.js";

describe("exam item-count policy", () => {
  it("requires at least 45 math questions for a 60-minute math exam", () => {
    expect(minimumItemsForExam({
      subjects: ["math"],
      splitPct: { math: 100 },
      durationSeconds: 60 * 60,
    })).toBe(45);
  });

  it("requires at least 16 English/RLA questions for a 60-minute English exam", () => {
    expect(minimumItemsForExam({
      subjects: ["rla"],
      splitPct: { rla: 100 },
      durationSeconds: 60 * 60,
    })).toBe(16);
  });

  it("requires at least 60 math questions for a 90-minute math exam", () => {
    expect(minimumItemsForExam({
      subjects: ["math"],
      splitPct: { math: 100 },
      durationSeconds: 90 * 60,
    })).toBe(60);
  });

  it("requires at least 25 English/RLA questions for a 90-minute English exam", () => {
    expect(minimumItemsForExam({
      subjects: ["rla"],
      splitPct: { rla: 100 },
      durationSeconds: 90 * 60,
    })).toBe(25);
  });

  it("uses the subject split for mixed 90-minute exams", () => {
    expect(minimumItemsForExam({
      subjects: ["math", "rla"],
      splitPct: { math: 50, rla: 50 },
      durationSeconds: 90 * 60,
    })).toBe(42);
  });

  it("requires 120 math questions for a 3-hour pure math exam", () => {
    expect(minimumItemsForExam({
      subjects: ["math"],
      splitPct: { math: 100 },
      durationSeconds: 180 * 60,
    })).toBe(120);
  });

  it("requires 50 English/RLA questions for a 3-hour pure English exam", () => {
    expect(minimumItemsForExam({
      subjects: ["rla"],
      splitPct: { rla: 100 },
      durationSeconds: 180 * 60,
    })).toBe(50);
  });

  it("raises a small requested count to the minimum for 90-minute exams", () => {
    expect(resolveExamTotalItems({
      requestedTotalItems: 10,
      fallbackTotalItems: 10,
      subjects: ["math"],
      splitPct: { math: 100 },
      durationSeconds: 90 * 60,
    })).toBe(60);
  });

  it("leaves shorter checks unchanged", () => {
    expect(resolveExamTotalItems({
      requestedTotalItems: 8,
      fallbackTotalItems: 10,
      subjects: ["math"],
      splitPct: { math: 100 },
      durationSeconds: 40 * 60,
    })).toBe(8);
  });
});
