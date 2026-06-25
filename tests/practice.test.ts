import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { assembleFocusedPractice, assemblePractice, earnUpTo, practiceAward, practiceQuestionKey, sourceItemIdFromPracticeId } from "~/domain/practice/practice.js";
import { richToText } from "~/lib/richText.js";
import { prepareBundle } from "~/server/content/import.js";
import type { Item } from "~/schemas/item.js";

function item(id: string, code: string): Item {
  return {
    _id: id, bundleId: "b", programKey: "grade3_staar", subject: "math",
    standardCodes: [code], type: "multiple_choice", difficulty: "easy",
    prompt: [`q${id}`], figures: [], points: 1, allowPartialCredit: false,
    explanation: [], workedSolution: [],
  };
}

function rlaItem(id: string, code: string, passageRef: string, prompt: string): Item {
  return {
    _id: id, bundleId: "rla", programKey: "grade3_staar", subject: "rla",
    standardCodes: [code], type: "multiple_choice", difficulty: "medium",
    passageRef, prompt: [prompt], figures: [], points: 1, allowPartialCredit: false,
    options: [
      { key: "A", text: "Correct answer", correct: true },
      { key: "B", text: "Distractor one", rationale: "Not supported." },
      { key: "C", text: "Distractor two", rationale: "Too narrow." },
      { key: "D", text: "Distractor three", rationale: "Unrelated." },
    ],
    explanation: ["Because."], workedSolution: ["Because."],
  };
}

function grade3RlaItems(): Item[] {
  const raw = JSON.parse(readFileSync(new URL("../content/grade3_rla.json", import.meta.url), "utf8"));
  return prepareBundle(raw).items;
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

  it("scopes review IDs to the current focus topic", () => {
    const first = assembleFocusedPractice(bank, "3.4K", ["3.2A"], { focusCount: 1, reviewCount: 1, reviewPerStandard: 1 });
    const second = assembleFocusedPractice(bank, "3.3F", ["3.2A"], { focusCount: 1, reviewCount: 1, reviewPerStandard: 1 });
    const firstReview = first.slots.find((slot) => slot.kind === "review")!;
    const secondReview = second.slots.find((slot) => slot.kind === "review")!;

    expect(firstReview.sourceItemId).toBe(secondReview.sourceItemId);
    expect(firstReview.standardCode).toBe(secondReview.standardCode);
    expect(firstReview.practiceItemId).not.toBe(secondReview.practiceItemId);
    expect(firstReview.practiceItemId).toContain("::practice:review:3.4K:3.2A:");
    expect(secondReview.practiceItemId).toContain("::practice:review:3.3F:3.2A:");
  });

  it("can disable cycling and skip duplicate RLA passage-question pairs", () => {
    const duplicateA = rlaItem("rla-a", "3.9D", "garden", "Which sentence BEST states the central idea?");
    const duplicateB = { ...duplicateA, _id: "rla-b" };
    const unique = rlaItem("rla-c", "3.9D", "garden", "Which detail supports the central idea?");

    const r = assembleFocusedPractice([duplicateA, duplicateB, unique], "3.9D", [], {
      focusCount: 20,
      reviewCount: 0,
      allowRepeats: false,
    });

    expect(r.slots).toHaveLength(2);
    expect(new Set(r.slots.map((slot) => practiceQuestionKey(slot.item, slot.standardCode))).size).toBe(2);
    expect(r.slots.map((slot) => slot.sourceItemId)).toEqual(["rla-a", "rla-c"]);
  });

  it.each(["3.9D", "3.10A"])("assembles 20 unique Grade 3 RLA %s practice questions", (standardCode) => {
    const r = assembleFocusedPractice(grade3RlaItems(), standardCode, [], {
      focusCount: 20,
      reviewCount: 0,
      allowRepeats: false,
    });
    const prompts = r.slots.map((slot) => richToText(slot.item.prompt));
    const passageQuestionPairs = r.slots.map((slot) => `${slot.item.passageRef ?? ""}:${richToText(slot.item.prompt)}`);
    const stableKeys = r.slots.map((slot) => practiceQuestionKey(slot.item, slot.standardCode));

    expect(r.slots).toHaveLength(20);
    expect(r.slots.every((slot) => slot.kind === "focus" && slot.standardCode === standardCode)).toBe(true);
    expect(new Set(prompts).size).toBe(20);
    expect(new Set(passageQuestionPairs).size).toBe(20);
    expect(new Set(stableKeys).size).toBe(20);
  });
});

describe("earnUpTo", () => {
  it("is scorable count × per-correct", () => {
    expect(earnUpTo(15, 10)).toBe(150);
  });
});

describe("practiceAward — instant + idempotent signed deltas", () => {
  it("awards per-correct on a fresh correct answer", () => {
    expect(practiceAward(true, false, 10)).toBe(10);
  });
  it("deducts per-correct on a fresh wrong answer", () => {
    expect(practiceAward(false, false, 10)).toBe(-10);
  });
  it("uses the configured wrong-answer penalty when provided", () => {
    expect(practiceAward(false, false, 10, 3)).toBe(-3);
  });
  it("does not re-award an already-awarded item", () => {
    expect(practiceAward(true, true, 10)).toBe(0);
  });
});
