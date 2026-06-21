import { describe, it, expect } from "vitest";
import { assembleFocusedPractice, assemblePractice, earnUpTo, practiceAward, sourceItemIdFromPracticeId } from "~/domain/practice/practice.js";
import type { Item } from "~/schemas/item.js";

function item(id: string, code: string): Item {
  return {
    _id: id, bundleId: "b", programKey: "grade3_staar", subject: "math",
    standardCodes: [code], type: "multiple_choice", difficulty: "easy",
    prompt: [`q${id}`], figures: [], points: 1, allowPartialCredit: false,
    explanation: [], workedSolution: [],
  };
}

// Bank mirroring the seeded Grade 3 Math pool sizes.
const bank: Item[] = [
  ...Array.from({ length: 4 }, (_, i) => item(`a${i}`, "3.2A")),
  ...Array.from({ length: 3 }, (_, i) => item(`d${i}`, "3.2D")),
  ...Array.from({ length: 4 }, (_, i) => item(`k${i}`, "3.4K")),
  ...Array.from({ length: 4 }, (_, i) => item(`f${i}`, "3.3F")),
];
const config = { "3.2A": { q: 4, m: 8 }, "3.2D": { q: 3, m: 6 }, "3.4K": { q: 4, m: 10 }, "3.3F": { q: 5, m: 10 } };

describe("assemblePractice", () => {
  it("draws up to the per-concept count and reports showing/bank", () => {
    const r = assemblePractice(bank, new Set(), config, ["3.2A", "3.2D", "3.4K", "3.3F"]);
    // 4 + 3 + 4 + min(5,4)=4 = 15
    expect(r.shownCount).toBe(15);
    expect(r.bankTotal).toBe(15);
    expect(r.questions).toHaveLength(15);
  });

  it("never repeats used items (no-repeat depletion)", () => {
    const used = new Set(["a0", "a1", "d0"]);
    const r = assemblePractice(bank, used, config);
    expect(r.questions.some((q) => used.has(q._id))).toBe(false);
    expect(r.unusedTotal).toBe(bank.length - used.size);
    // 3.2A now yields 2, 3.2D yields 2
    expect(r.questions.filter((q) => q.standardCodes.includes("3.2A"))).toHaveLength(2);
  });

  it("skips concepts configured to 0", () => {
    const r = assemblePractice(bank, new Set(), { "3.2A": { q: 0, m: 0 }, "3.2D": { q: 2, m: 5 } });
    expect(r.questions.every((q) => q.standardCodes.includes("3.2D"))).toBe(true);
    expect(r.shownCount).toBe(2);
  });
});

describe("assembleFocusedPractice", () => {
  it("creates a 20-question focused set even when the topic bank is shallow", () => {
    const r = assembleFocusedPractice(bank, "3.2A", []);
    expect(r.slots).toHaveLength(20);
    expect(r.slots.every((slot) => slot.standardCode === "3.2A")).toBe(true);
    expect(new Set(r.slots.map((slot) => slot.practiceItemId)).size).toBe(20);
    expect(r.slots.map((slot) => sourceItemIdFromPracticeId(slot.practiceItemId)).every((id) => id.startsWith("a"))).toBe(true);
  });

  it("adds a small review tail from previously completed lessons", () => {
    const r = assembleFocusedPractice(bank, "3.4K", ["3.2A", "3.2D"], { focusCount: 20, reviewCount: 5, reviewPerStandard: 2 });
    expect(r.slots.filter((slot) => slot.kind === "focus")).toHaveLength(20);
    expect(r.slots.filter((slot) => slot.kind === "review")).toHaveLength(4);
    expect(new Set(r.slots.filter((slot) => slot.kind === "review").map((slot) => slot.standardCode))).toEqual(new Set(["3.2A", "3.2D"]));
  });
});

describe("earnUpTo", () => {
  it("is scorable count × per-correct", () => {
    expect(earnUpTo(15, 10)).toBe(150);
  });
});

describe("practiceAward — instant + idempotent, no negatives", () => {
  it("awards per-correct on a fresh correct answer", () => {
    expect(practiceAward(true, false, 10)).toBe(10);
  });
  it("awards nothing for a wrong answer (no penalty)", () => {
    expect(practiceAward(false, false, 10)).toBe(0);
  });
  it("does not re-award an already-awarded item", () => {
    expect(practiceAward(true, true, 10)).toBe(0);
  });
});
