import { describe, expect, it } from "vitest";
import { scoreExamSession } from "~/domain/exam/scoreExam.js";
import { buildExamDetailReport } from "~/server/exam/detail.js";
import { reportBody } from "~/server/notifications/progressReports.js";
import type { Item } from "~/schemas/item.js";

function mc(id: string, correctKey = "A"): Item {
  return {
    _id: id,
    bundleId: "b",
    programKey: "grade3_staar",
    subject: "math",
    standardCodes: ["3.2A"],
    type: "multiple_choice",
    difficulty: "easy",
    prompt: [`Question ${id}`],
    figures: [],
    points: 1,
    allowPartialCredit: false,
    options: [
      { key: "A", text: "Correct", ...(correctKey === "A" ? { correct: true } : {}) },
      { key: "B", text: "Wrong", rationale: "B does not match the worked solution.", ...(correctKey === "B" ? { correct: true } : {}) },
    ],
    explanation: ["Use the matching answer."],
    workedSolution: ["The correct answer is A."],
  };
}

describe("exam detail reports", () => {
  it("serializes every exam question with answers, result, Robux impact, and explanation", () => {
    const items = [mc("q1"), mc("q2")];
    const result = scoreExamSession({
      items,
      responses: { q1: "A", q2: "B" },
      conversionTables: {},
      robuxRules: { correctQuestionReward: 5, examMaxReward: 400, examWrong: 5 },
    });
    const detail = buildExamDetailReport({
      sessionId: "s1",
      examId: "e1",
      enrollmentId: "enr1",
      studentId: "stu1",
      programTitle: "Grade 3 STAAR",
      completedAt: new Date("2026-06-27T12:00:00Z"),
      itemIds: ["q1", "q2"],
      items,
      responses: { q1: "A", q2: "B" },
      result,
      correctQuestionReward: 5,
      examMaxReward: 400,
      wrongPenalty: 5,
    });

    expect(detail.questions).toHaveLength(2);
    expect(detail.questions[0]).toMatchObject({ studentAnswer: "A. Correct", correctAnswer: "A. Correct", result: "Correct", robuxImpact: 5 });
    expect(detail.questions[1]).toMatchObject({ studentAnswer: "B. Wrong", correctAnswer: "A. Correct", result: "Incorrect", robuxImpact: -5 });
    expect(detail.questions[1]!.explanation).toContain("The correct answer is A.");
  });

  it("renders exam-only report summary and final Robux for 57 right / 18 wrong", () => {
    const correct = Array.from({ length: 57 }, (_, index) => mc(`c${index}`));
    const wrong = Array.from({ length: 18 }, (_, index) => mc(`w${index}`));
    const items = [...correct, ...wrong];
    const responses = Object.fromEntries(items.map((item) => [item._id, item._id.startsWith("c") ? "A" : "B"]));
    const result = scoreExamSession({
      items,
      responses,
      conversionTables: {},
      robuxRules: { correctQuestionReward: 5, examMaxReward: 400, examWrong: 5 },
    });
    const detail = buildExamDetailReport({
      sessionId: "s1",
      examId: "e1",
      enrollmentId: "enr1",
      studentId: "stu1",
      programTitle: "Grade 3 STAAR",
      completedAt: new Date("2026-06-27T12:00:00Z"),
      itemIds: items.map((item) => item._id),
      items,
      responses,
      result,
      correctQuestionReward: 5,
      examMaxReward: 400,
      wrongPenalty: 5,
    });
    const html = reportBody({
      studentName: "Example Student",
      programTitle: "Grade 3 STAAR",
      lessons: [],
      practice: { solved: 0, right: 0, wrong: 0 },
      exam: detail,
      reportDate: "2026-06-27",
    });

    expect(detail.summary).toMatchObject({
      questionsSolved: 75,
      correctCount: 57,
      wrongCount: 18,
      scorePct: 76,
      rawCorrectReward: 285,
      wrongPenaltyTotal: 90,
      capAdjustment: 0,
      finalRobux: 195,
    });
    expect(html).toContain("<strong>75</strong>");
    expect(html).toContain("<strong>57</strong> right, <strong>18</strong> wrong");
    expect(html).toContain("Final Exam Robux earned");
    expect(html).toContain("<strong>195</strong>");
    expect(html).toContain("Exam Details");
    expect(html).not.toContain("22710");
  });
});
