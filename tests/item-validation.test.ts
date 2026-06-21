import { describe, expect, it } from "vitest";
import { validateItemAuthoring } from "~/domain/content/itemValidation.js";
import type { Item } from "~/schemas/item.js";

function item(overrides: Partial<Item>): Item {
  return {
    _id: "i1",
    bundleId: "b1",
    programKey: "grade3_staar",
    subject: "math",
    standardCodes: ["3.2A"],
    type: "multiple_choice",
    difficulty: "easy",
    prompt: ["Question"],
    figures: [],
    options: [
      { key: "A", text: "1", correct: true },
      { key: "B", text: "2" },
    ],
    points: 1,
    allowPartialCredit: false,
    explanation: [],
    workedSolution: [],
    ...overrides,
  };
}

describe("validateItemAuthoring", () => {
  it("rejects Select TWO multiselects with the wrong number of correct options", () => {
    const issues = validateItemAuthoring(item({
      type: "multiselect",
      prompt: ["Select TWO expanded-form parts."],
      options: [
        { key: "A", text: "1", correct: true },
        { key: "B", text: "2", correct: true },
        { key: "C", text: "3", correct: true },
      ],
    }));
    expect(issues.join(" ")).toContain("Select TWO");
  });

  it("rejects ambiguous duplicate-digit place-value prompts", () => {
    const issues = validateItemAuthoring(item({
      prompt: ["What is the value of the 6 in 16,647?"],
      options: [
        { key: "A", text: "6" },
        { key: "B", text: "600" },
        { key: "C", text: "6,000", correct: true },
      ],
    }));
    expect(issues.join(" ")).toContain("more than one 6");
  });

  it("allows duplicate-digit prompts when the place is named", () => {
    const issues = validateItemAuthoring(item({
      prompt: ["What is the value of the 6 in the thousands place in 16,647?"],
      options: [
        { key: "A", text: "6" },
        { key: "B", text: "600" },
        { key: "C", text: "6,000", correct: true },
      ],
    }));
    expect(issues).toEqual([]);
  });

  it("flags expanded-form distractors that are actually correct parts", () => {
    const issues = validateItemAuthoring(item({
      type: "multiselect",
      prompt: ["Select ALL expanded-form parts of 43,635."],
      options: [
        { key: "A", text: "30" },
        { key: "B", text: "40,000", correct: true },
        { key: "C", text: "30,000" },
        { key: "D", text: "5", correct: true },
        { key: "F", text: "3,000", correct: true },
        { key: "G", text: "600", correct: true },
      ],
    }));
    expect(issues.join(" ")).toContain("option A");
  });
});
