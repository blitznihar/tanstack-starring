import { describe, it, expect } from "vitest";
import { scoreItem } from "~/domain/scoring/score.js";
import { updateMastery, type MasteryState } from "~/domain/mastery/mastery.js";
import { scoreExamSession } from "~/domain/exam/scoreExam.js";
import type { Item } from "~/schemas/item.js";

function mc(id: string, code: string, correctKey: string): Item {
  return {
    _id: id, bundleId: "b", programKey: "grade3_staar", subject: "math",
    standardCodes: [code], type: "multiple_choice", difficulty: "easy",
    prompt: [id], figures: [], points: 1, allowPartialCredit: false,
    options: [
      { key: "A", text: "a", ...(correctKey === "A" ? { correct: true } : {}) },
      { key: "B", text: "b", ...(correctKey === "B" ? { correct: true } : {}) },
    ],
    explanation: [], workedSolution: [],
  };
}

/**
 * Integration (§17): submit → deterministic score → mastery update, composing the
 * real scoring, exam-scoring, and mastery domain modules end to end.
 */
describe("submit → score → mastery", () => {
  it("a correct answer scores and advances mastery; a wrong one regresses it", () => {
    const item = mc("i1", "3.2A", "A");
    const mastery = new Map<string, MasteryState>();

    // Submit a correct response.
    const r1 = scoreItem(item, "A");
    expect(r1.correct).toBe(true);
    mastery.set("3.2A", updateMastery(mastery.get("3.2A"), "3.2A", r1.correct));
    expect(mastery.get("3.2A")!.state).toBe("mastered");

    // Submit a wrong response on the same standard.
    const r2 = scoreItem(mc("i2", "3.2A", "A"), "B");
    expect(r2.correct).toBe(false);
    mastery.set("3.2A", updateMastery(mastery.get("3.2A"), "3.2A", r2.correct));
    expect(mastery.get("3.2A")!.rollingAccuracy).toBeLessThan(1);
  });

  it("scores a full exam submission and folds every item into mastery", () => {
    const items = [mc("m1", "3.2A", "A"), mc("m2", "3.2A", "A"), mc("m3", "3.4K", "A")];
    const responses = { m1: "A", m2: "A", m3: "B" }; // 2 right (3.2A), 1 wrong (3.4K)

    const result = scoreExamSession({
      items,
      responses,
      conversionTables: {},
      robuxRules: { correctQuestionReward: 20, examMaxReward: 400, examWrong: 10 },
    });

    const mastery = new Map<string, MasteryState>();
    for (const r of result.itemResults) {
      if (r.pending) continue;
      const item = items.find((i) => i._id === r.itemId)!;
      for (const code of item.standardCodes) {
        mastery.set(code, updateMastery(mastery.get(code), code, r.correct));
      }
    }

    expect(result.overall.correctCount).toBe(2);
    expect(result.overall.wrongCount).toBe(1);
    expect(mastery.get("3.2A")!.state).toBe("mastered"); // 2/2
    expect(mastery.get("3.4K")!.state).toBe("not_mastered"); // 0/1
    // Net Robux reflects the wrong-answer penalty.
    expect(result.robux.net).toBe(2 * 20 - 1 * 10);
  });
});
