import { describe, it, expect } from "vitest";
import { prepareBundle } from "~/server/content/import.js";

const goodBundle = {
  programKey: "grade3_staar",
  subject: "math",
  version: 1,
  title: "Grade 3 Math",
  standards: [
    { code: "3.2A", programKey: "grade3_staar", subject: "math", description: "Place value" },
  ],
  items: [
    {
      standardCodes: ["3.2A"],
      type: "multiple_choice",
      difficulty: "easy",
      prompt: ["What is the value of the 7 in 4,732?"],
      options: [
        { key: "A", text: "7", rationale: "ones place" },
        { key: "C", text: "700", correct: true },
      ],
      explanation: ["The 7 is in the hundreds place."],
      workedSolution: ["7 × 100 = 700"],
    },
    {
      standardCodes: ["3.2A"],
      type: "multiple_choice",
      difficulty: "medium",
      prompt: ["6,000 + 300 + 40 + 9 = ?"],
      options: [
        { key: "A", text: "6,349", correct: true },
        { key: "B", text: "6,439" },
      ],
      explanation: ["Add each place value."],
      workedSolution: ["6,000 + 300 + 40 + 9 = 6,349"],
    },
  ],
};

describe("prepareBundle", () => {
  it("validates and assigns ids + bundleId + defaults", () => {
    const result = prepareBundle(goodBundle);
    expect(result.bundleId).toBe("grade3_staar:math:v1");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!._id).toBe("grade3_staar:math:v1#0");
    expect(result.items[0]!.programKey).toBe("grade3_staar");
    expect(result.items[0]!.subject).toBe("math");
    expect(result.items[0]!.source).toBe("generated");
    expect(result.status).toBe("available");
  });

  it("preserves an authored item source", () => {
    const result = prepareBundle({
      ...goodBundle,
      items: [{ ...goodBundle.items[0], source: "authored" }],
    });
    expect(result.items[0]!.source).toBe("authored");
  });

  it("rejects items missing standardCodes", () => {
    const bad = {
      ...goodBundle,
      items: [{ ...goodBundle.items[0], standardCodes: [] }],
    };
    expect(() => prepareBundle(bad)).toThrow();
  });

  it("rejects a bundle with no items", () => {
    expect(() => prepareBundle({ ...goodBundle, items: [] })).toThrow();
  });

  it("detects duplicate item ids", () => {
    const dup = {
      ...goodBundle,
      items: [
        { ...goodBundle.items[0], _id: "dupe" },
        { ...goodBundle.items[1], _id: "dupe" },
      ],
    };
    expect(() => prepareBundle(dup)).toThrow(/Duplicate item/);
  });
});
