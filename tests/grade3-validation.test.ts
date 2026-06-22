import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSchedule } from "~/domain/scheduler/scheduler.js";
import { practiceAward } from "~/domain/practice/practice.js";
import { scoreItem } from "~/domain/scoring/score.js";
import type { Standard } from "~/schemas/contentBundle.js";
import type { Item } from "~/schemas/item.js";
import type { LessonDoc } from "~/schemas/lesson.js";
import type { Program } from "~/schemas/program.js";
import {
  buildValidationReport,
  planValidationCleanup,
  validateQuestion,
  VALIDATION_STUDENT_EMAIL,
  writeValidationReports,
} from "../scripts/grade3-staar/validationCore.js";

function program(): Program {
  return {
    key: "grade3_staar",
    title: "Grade 3 STAAR",
    category: "K-12",
    subjects: ["math", "rla"],
    targetDays: 45,
    examBlueprint: {
      durationPresets: [60, 180],
      defaultDurationMinutes: 60,
      defaultSplitPct: { math: 70, rla: 30 },
      breakSeconds: 300,
    },
    scoringModel: { conversionTables: [], levels: ["did_not_meet", "approaches", "meets", "masters"] },
    conceptConfig: {},
    robuxRules: { practiceCorrect: 5, examCorrect: 20, examWrong: 5, lessonComplete: 5 },
    status: "live",
  };
}

function standard(subject: string, code: string): Standard {
  return { programKey: "grade3_staar", subject, code, description: `${subject} ${code}` };
}

function lesson(subject: string, code: string): LessonDoc {
  return {
    _id: `lesson-${subject}-${code}`,
    programKey: "grade3_staar",
    subject,
    standardCode: code,
    version: 1,
    status: "available",
    title: `${subject.toUpperCase()} ${code}`,
    body: [{ kind: "paragraph", text: "A focused lesson." }],
    vocabulary: [],
    practiceExamples: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function item(id: string, subject: string, code: string, overrides: Partial<Item> = {}): Item {
  return {
    _id: id,
    bundleId: "bundle",
    programKey: "grade3_staar",
    subject,
    standardCodes: [code],
    type: "multiple_choice",
    difficulty: "easy",
    prompt: [`Question for ${code}?`],
    figures: [],
    options: [
      { key: "A", text: "Right", correct: true },
      { key: "B", text: "Wrong", rationale: "Not the right value." },
    ],
    points: 1,
    allowPartialCredit: false,
    explanation: ["Because A is correct."],
    workedSolution: ["Work it step by step."],
    ...overrides,
  };
}

function fullDataset() {
  const mathCodes = Array.from({ length: 44 }, (_, index) => `3.${index + 1}M`);
  const rlaCodes = Array.from({ length: 10 }, (_, index) => `3.${index + 1}R`);
  const standards = [
    ...mathCodes.map((code) => standard("math", code)),
    ...rlaCodes.map((code) => standard("rla", code)),
  ];
  const lessons = [
    ...mathCodes.map((code) => lesson("math", code)),
    ...rlaCodes.map((code) => lesson("rla", code)),
  ];
  const items = [
    ...mathCodes.flatMap((code, codeIndex) => Array.from({ length: 4 }, (_, index) => item(`m-${codeIndex}-${index}`, "math", code))),
    ...rlaCodes.flatMap((code, codeIndex) => Array.from({ length: 4 }, (_, index) => item(`r-${codeIndex}-${index}`, "rla", code))),
  ];
  return { program: program(), standards, lessons, items };
}

describe("Grade 3 STAAR validation scheduler", () => {
  it("warms up weekend starts with lessons before the first exam", () => {
    const topicsBySubject = {
      math: Array.from({ length: 44 }, (_, index) => `M${index + 1}`),
      rla: Array.from({ length: 10 }, (_, index) => `R${index + 1}`),
    };
    const schedule = buildSchedule({
      startDate: "2026-06-20",
      targetDays: 45,
      subjects: ["math", "rla"],
      topicsBySubject,
      quotaBySubject: { math: 2, rla: 1 },
      lessonWeekdays: [1, 2, 3, 4],
      examWeekdays: [5, 6, 0],
      theta: 4,
      shortExamMinutes: 60,
      longExamMinutes: 180,
    });
    expect(schedule.days[0]?.dayType).toBe("lessons_practice");
    expect(schedule.days[1]?.dayType).toBe("lessons_practice");
    const firstExam = schedule.days.find((day) => day.tasks.some((task) => task.kind === "exam"));
    expect(firstExam?.date).toBe("2026-06-26");
    expect(firstExam?.tasks.find((task) => task.kind === "exam")?.durationMinutes).toBe(180);
  });
});

describe("Grade 3 STAAR question validation", () => {
  it("rejects multiple correct answers on a single-choice item", () => {
    const row = validateQuestion(item("bad-mc", "math", "3.2A", {
      options: [
        { key: "A", text: "One", correct: true },
        { key: "B", text: "Also one", correct: true },
      ],
    }));
    expect(row.status).toBe("FAIL");
    expect(row.issues.some((issue) => issue.code === "mc-correct-count")).toBe(true);
  });

  it("rejects Select TWO prompts that do not have exactly two correct answers", () => {
    const row = validateQuestion(item("bad-ms", "rla", "3.10A", {
      type: "multiselect",
      prompt: ["Select TWO details that support the author's purpose."],
      options: [
        { key: "A", text: "Only correct", correct: true },
        { key: "B", text: "Distractor" },
        { key: "C", text: "Distractor" },
      ],
    }));
    expect(row.status).toBe("FAIL");
    expect(row.issues.some((issue) => issue.code === "select-count-mismatch")).toBe(true);
  });
});

describe("Grade 3 STAAR reward and answer checks", () => {
  it("scores multi-select only when the selected set exactly matches", () => {
    const q = item("multi", "math", "3.2A", {
      type: "multiselect",
      options: [
        { key: "A", text: "Correct A", correct: true },
        { key: "B", text: "Correct B", correct: true },
        { key: "C", text: "Extra" },
      ],
    });
    expect(scoreItem(q, ["A", "B"]).correct).toBe(true);
    expect(scoreItem(q, ["A"]).correct).toBe(false);
    expect(scoreItem(q, ["A", "B", "C"]).correct).toBe(false);
  });

  it("awards correct practice answers and deducts wrong answers", () => {
    expect(practiceAward(true, false, 5, 5)).toBe(5);
    expect(practiceAward(false, false, 5, 5)).toBe(-5);
    expect(practiceAward(true, true, 5, 5)).toBe(0);
  });
});

describe("Grade 3 STAAR report artifacts", () => {
  it("writes all required report files with parseable JSON and CSV", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "grade3-report-"));
    try {
      const report = buildValidationReport(fullDataset(), {
        startDate: "2026-06-20",
        days: 45,
        reportDir: dir,
      });
      const files = await writeValidationReports(report, dir);
      expect(files.map((file) => path.basename(file)).sort()).toEqual([
        "grade3-staar-45-day-exam-readiness.md",
        "grade3-staar-45-day-fixes-applied.md",
        "grade3-staar-45-day-question-validation.csv",
        "grade3-staar-45-day-question-validation.json",
        "grade3-staar-45-day-schedule.md",
        "grade3-staar-45-day-validation-summary.md",
      ].sort());
      const json = JSON.parse(await readFile(path.join(dir, "grade3-staar-45-day-question-validation.json"), "utf8"));
      expect(json.metadata.studentEmail).toBe(VALIDATION_STUDENT_EMAIL);
      expect(json.schedule).toHaveLength(45);
      const csv = await readFile(path.join(dir, "grade3-staar-45-day-question-validation.csv"), "utf8");
      expect(csv).toContain("itemId");
      expect(csv).toContain("status");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("Grade 3 STAAR cleanup safety", () => {
  it("is dry-run by default and requires exact email confirmation", () => {
    const blocked = planValidationCleanup({ studentUserId: "student-1", enrollmentId: "enrollment-1" });
    expect(blocked.dryRun).toBe(true);
    expect(blocked.safeToExecute).toBe(false);

    const ready = planValidationCleanup({
      studentUserId: "student-1",
      enrollmentId: "enrollment-1",
      confirmEmail: VALIDATION_STUDENT_EMAIL,
      dryRun: false,
    });
    expect(ready.safeToExecute).toBe(true);
    expect(ready.reason).toContain("Exact student email confirmation");
  });
});
