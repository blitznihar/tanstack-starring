import { describe, it, expect } from "vitest";
import { scoreExamSession } from "~/domain/exam/scoreExam.js";
import type { Item } from "~/schemas/item.js";
import type { ConversionTable } from "~/schemas/program.js";

function mc(id: string, subject: string, correctKey: string): Item {
  return {
    _id: id, bundleId: "b", programKey: "grade3_staar", subject,
    standardCodes: ["3.2A"], type: "multiple_choice", difficulty: "easy",
    prompt: [id], figures: [], points: 1, allowPartialCredit: false,
    options: [
      { key: "A", text: "a", ...(correctKey === "A" ? { correct: true } : {}) },
      { key: "B", text: "b", ...(correctKey === "B" ? { correct: true } : {}) },
    ],
    explanation: [], workedSolution: [],
  };
}
function ecr(id: string, subject: string): Item {
  return {
    _id: id, bundleId: "b", programKey: "grade3_staar", subject,
    standardCodes: ["3.8A"], type: "ecr", difficulty: "hard",
    prompt: [id], figures: [], points: 5, allowPartialCredit: true,
    rubric: { maxPoints: 5, criteria: [] }, explanation: [], workedSolution: [],
  };
}

const mathTable: ConversionTable = {
  subject: "math", year: 2024,
  rows: [
    { rawMin: 0, rawMax: 1, scale: 1100 },
    { rawMin: 2, rawMax: 3, scale: 1500 },
    { rawMin: 4, rawMax: 5, scale: 1800 },
  ],
  cutPoints: { approaches: 1350, meets: 1500, masters: 1700 },
};

describe("scoreExamSession", () => {
  const items = [mc("m1", "math", "A"), mc("m2", "math", "A"), mc("m3", "math", "A"), ecr("r1", "rla")];

  it("scores deterministic items, converts raw→scale→level, and flags ECR pending", () => {
    const result = scoreExamSession({
      items,
      responses: { m1: "A", m2: "A", m3: "B", r1: "an essay" }, // 2 correct, 1 wrong
      conversionTables: { math: mathTable },
      robuxRules: { examCorrect: 20, examWrong: 10 },
    });
    const math = result.perSubject.find((s) => s.subject === "math")!;
    expect(math.correctCount).toBe(2);
    expect(math.wrongCount).toBe(1);
    expect(math.raw).toBe(2);
    expect(math.scale).toBe(1500);
    expect(math.level).toBe("meets");
    // ECR is pending, not auto-scored
    expect(result.pending).toBe(true);
    const rla = result.perSubject.find((s) => s.subject === "rla")!;
    expect(rla.pendingCount).toBe(1);
    expect(rla.total).toBe(0);
  });

  it("applies negative Robux for wrong answers with a floor", () => {
    const result = scoreExamSession({
      items: [mc("m1", "math", "A"), mc("m2", "math", "A")],
      responses: { m1: "A", m2: "B" }, // 1 correct, 1 wrong
      conversionTables: { math: mathTable },
      robuxRules: { examCorrect: 20, examWrong: 10 },
    });
    expect(result.robux).toEqual({ gross: 20, penalty: 10, net: 10 });
  });

  it("does not penalize blank (unanswered) items", () => {
    const result = scoreExamSession({
      items: [mc("m1", "math", "A"), mc("m2", "math", "A")],
      responses: { m1: "A" }, // m2 blank
      conversionTables: { math: mathTable },
      robuxRules: { examCorrect: 20, examWrong: 10 },
    });
    const math = result.perSubject.find((s) => s.subject === "math")!;
    expect(math.correctCount).toBe(1);
    expect(math.wrongCount).toBe(0); // blank ≠ wrong
    expect(result.robux.net).toBe(20);
  });
});
