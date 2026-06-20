import { describe, it, expect } from "vitest";
import { scoreItem } from "~/domain/scoring/score.js";
import type { Item } from "~/schemas/item.js";

function base(overrides: Partial<Item>): Item {
  return {
    _id: "x",
    bundleId: "b",
    programKey: "grade3_staar",
    subject: "math",
    standardCodes: ["3.2A"],
    type: "multiple_choice",
    difficulty: "easy",
    prompt: ["q"],
    figures: [],
    points: 1,
    allowPartialCredit: false,
    explanation: [],
    workedSolution: [],
    ...overrides,
  };
}

describe("scoreItem — multiple_choice", () => {
  const item = base({
    type: "multiple_choice",
    options: [
      { key: "A", text: "7" },
      { key: "B", text: "70" },
      { key: "C", text: "700", correct: true },
      { key: "D", text: "7000" },
    ],
  });
  it("awards full points for the correct key", () => {
    expect(scoreItem(item, "C")).toMatchObject({ earned: 1, correct: true });
  });
  it("awards zero for a wrong key", () => {
    expect(scoreItem(item, "A")).toMatchObject({ earned: 0, correct: false });
  });
  it("does not crash on a non-string response", () => {
    expect(scoreItem(item, ["C"]).earned).toBe(0);
    expect(scoreItem(item, { k: "C" }).earned).toBe(0);
  });
});

describe("scoreItem — multiselect partial credit", () => {
  const opts = [
    { key: "A", text: "a", correct: true },
    { key: "B", text: "b", correct: true },
    { key: "C", text: "c" },
    { key: "D", text: "d" },
  ];
  it("all-or-nothing without partial credit", () => {
    const item = base({ type: "multiselect", points: 2, options: opts });
    expect(scoreItem(item, ["A", "B"])).toMatchObject({ earned: 2, correct: true });
    expect(scoreItem(item, ["A"])).toMatchObject({ earned: 0, correct: false });
  });
  it("gives partial credit, penalizing wrong picks", () => {
    const item = base({ type: "multiselect", points: 2, options: opts, allowPartialCredit: true });
    expect(scoreItem(item, ["A"]).earned).toBe(1); // 1/2 correct
    expect(scoreItem(item, ["A", "B"]).earned).toBe(2); // both
    expect(scoreItem(item, ["A", "C"]).earned).toBe(0); // net 1-1=0
  });
});

describe("scoreItem — text_entry numeric equality", () => {
  const item = base({ type: "text_entry", answer: "0.5" });
  it("matches numerically-equivalent answers", () => {
    expect(scoreItem(item, ".50").correct).toBe(true);
    expect(scoreItem(item, "0.5").correct).toBe(true);
    expect(scoreItem(item, "1/2").correct).toBe(false);
  });
});

describe("scoreItem — multipart", () => {
  const item = base({
    type: "multipart",
    points: 2,
    allowPartialCredit: true,
    parts: [
      { id: "A", prompt: ["a"], type: "multiple_choice", options: [{ key: "A", text: "", correct: true }, { key: "B", text: "" }] },
      { id: "B", prompt: ["b"], type: "multiple_choice", options: [{ key: "A", text: "" }, { key: "B", text: "", correct: true }] },
    ],
  });
  it("sums part credit", () => {
    expect(scoreItem(item, { A: "A", B: "B" })).toMatchObject({ earned: 2, correct: true });
    expect(scoreItem(item, { A: "A", B: "A" }).earned).toBe(1);
  });
});

describe("scoreItem — scr/ecr route to async", () => {
  it("flags requiresAsync and does not auto-score", () => {
    const item = base({ type: "ecr", rubric: { maxPoints: 5, criteria: [] } });
    expect(scoreItem(item, "an essay")).toMatchObject({ requiresAsync: true, earned: 0, max: 5 });
  });
});
