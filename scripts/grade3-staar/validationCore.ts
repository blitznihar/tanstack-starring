import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { assembleExam } from "~/domain/exam/assemble.js";
import { assembleFocusedPractice, practiceAward } from "~/domain/practice/practice.js";
import { buildSchedule, type DayPlan, type Schedule, type Task } from "~/domain/scheduler/scheduler.js";
import { mongodbDatabaseNameForVercelEnv } from "~/lib/env.js";
import { richToText } from "~/lib/richText.js";
import { scoreItem } from "~/domain/scoring/score.js";
import type { Standard } from "~/schemas/contentBundle.js";
import type { Item, ItemOption } from "~/schemas/item.js";
import type { LessonDoc } from "~/schemas/lesson.js";
import type { Passage } from "~/schemas/passage.js";
import type { Program } from "~/schemas/program.js";

export const VALIDATION_STUDENT_EMAIL = "nihar.malali.r@gmail.com";
export const VALIDATION_STUDENT_NAME = "Araina Malali";
export const VALIDATION_PARENT_NAME = "Sushma Malali";
export const VALIDATION_PARENT_EMAIL = "nihar.malali@gmail.com";
export const DEFAULT_PROGRAM_ARG = "GRADE_3_STAAR";
export const DEFAULT_PROGRAM_KEY = "grade3_staar";
export const DEFAULT_TARGET_DAYS = 45;
export const DEFAULT_PRACTICE_FOCUS_COUNT = 20;
export const DEFAULT_EXAM_ITEM_COUNT = 10;
export const DEFAULT_REPORT_DIR = "report";

export type ValidationStatus = "PASS" | "FAIL";
export type IssueSeverity = "error" | "warning";

export type CliArgs = Record<string, string | boolean>;

export type ValidationIssue = {
  severity: IssueSeverity;
  category: string;
  code: string;
  message: string;
  subject?: string;
  standardCode?: string;
  itemId?: string;
  dayIndex?: number;
  date?: string;
  recommendation?: string;
};

export type QuestionValidationRow = {
  itemId: string;
  subject: string;
  standardCodes: string[];
  type: string;
  prompt: string;
  status: ValidationStatus;
  issues: ValidationIssue[];
};

export type ScheduleTaskReport = {
  id: string;
  kind: string;
  subject: string;
  standardCode: string;
  title: string;
  status: "PENDING";
};

export type ScheduleDayReport = {
  day: number;
  date: string;
  weekday: string;
  dayType: string;
  remainingAfter: number;
  tasks: ScheduleTaskReport[];
  lessonRanges: string[];
  issues: ValidationIssue[];
};

export type ExamReadinessRow = {
  day: number;
  date: string;
  weekday: string;
  durationMinutes: number;
  completedTopicsBeforeExam: string[];
  availableBySubject: Record<string, number>;
  assembledItemCount: number;
  status: ValidationStatus;
  issues: ValidationIssue[];
};

export type ValidationReport = {
  metadata: {
    generatedAt: string;
    studentEmail: string;
    studentName: string;
    parentName: string;
    parentEmail: string;
    programArg: string;
    programKey: string;
    programTitle: string;
    startDate: string;
    endDate: string;
    targetDays: number;
    reportDir: string;
  };
  status: ValidationStatus;
  totals: {
    scheduleDays: number;
    lessonDays: number;
    longExamDays: number;
    shortExamDays: number;
    mathTopics: number;
    rlaTopics: number;
    lessons: number;
    items: number;
    validQuestions: number;
    invalidQuestions: number;
    warnings: number;
    errors: number;
  };
  issues: ValidationIssue[];
  schedule: ScheduleDayReport[];
  questions: QuestionValidationRow[];
  exams: ExamReadinessRow[];
  fixesApplied: string[];
};

export type ValidationDataset = {
  program: Program;
  standards: Standard[];
  lessons: LessonDoc[];
  items: Item[];
  passages?: Passage[];
};

export type ValidationOptions = {
  studentEmail?: string;
  studentName?: string;
  parentName?: string;
  parentEmail?: string;
  programArg?: string;
  startDate?: string;
  days?: number;
  reportDir?: string;
};

export type CleanupPlan = {
  dryRun: boolean;
  safeToExecute: boolean;
  reason: string;
  studentEmail: string;
  parentEmail: string;
  programKey: string;
  confirmEmail: string;
  operations: string[];
};

export function parseCliArgs(argv = process.argv.slice(2)): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) out[body] = true;
    else out[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return out;
}

export function argString(args: CliArgs, key: string, fallback: string): string {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function argInt(args: CliArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function argBool(args: CliArgs, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function normalizeProgramKey(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (cleaned === "grade_3_staar" || cleaned === "grade3staar" || cleaned === "grade3_staar") return DEFAULT_PROGRAM_KEY;
  return cleaned;
}

export function todayInCentral(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export function assertSafeMutation(options: { force?: boolean; action: string }): void {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.toLowerCase();
  const dbName = mongodbDatabaseNameForVercelEnv();
  const productionLike = nodeEnv === "production" || vercelEnv === "production" || dbName === "comet";
  if (!productionLike) return;
  const override = process.env.ALLOW_GRADE3_VALIDATION_PROD === "true";
  if (!options.force || !override) {
    throw new Error(
      `Refusing to ${options.action} in a production-like environment (${dbName}). ` +
        "Use a dev/test database, or set ALLOW_GRADE3_VALIDATION_PROD=true with --force after verifying the target records.",
    );
  }
}

function naturalCodeCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function topicsBySubjectFromData(input: Pick<ValidationDataset, "program" | "standards" | "items">): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const subject of input.program.subjects) {
    const fromStandards = input.standards
      .filter((standard) => standard.programKey === input.program.key && standard.subject === subject)
      .map((standard) => standard.code)
      .filter(Boolean);
    const fallback = input.items
      .filter((item) => item.programKey === input.program.key && item.subject === subject)
      .flatMap((item) => item.standardCodes);
    out[subject] = [...new Set(fromStandards.length > 0 ? fromStandards : fallback)].sort(naturalCodeCompare);
  }
  return out;
}

function taskSubject(task: Task): string {
  return task.subject ?? "";
}

function taskTopic(task: Task): string {
  return task.topic ?? "";
}

function lessonKey(subject: string, standardCode: string): string {
  return `${subject}:${standardCode}`;
}

function issue(input: ValidationIssue): ValidationIssue {
  return input;
}

function questionText(item: Pick<Item, "prompt">): string {
  return richToText(item.prompt);
}

function correctOptionKeys(options: ItemOption[] | undefined): string[] {
  return (options ?? []).filter((option) => option.correct).map((option) => option.key);
}

function duplicateTexts(options: ItemOption[] | undefined): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const option of options ?? []) {
    const text = option.text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!text) continue;
    if (seen.has(text)) dupes.add(option.text.trim());
    seen.add(text);
  }
  return [...dupes];
}

function selectExactCount(prompt: string): number | null {
  const text = prompt.toLowerCase();
  if (text.includes("select two")) return 2;
  if (text.includes("select three")) return 3;
  if (text.includes("select four")) return 4;
  const match = text.match(/select\s+(\d+)/);
  return match ? Number(match[1]) : null;
}

function requireNonemptyRich(item: Item, field: "explanation" | "workedSolution", issues: ValidationIssue[]): void {
  if (!richToText(item[field]).trim()) {
    issues.push(issue({
      severity: "warning",
      category: "question-quality",
      code: `missing-${field}`,
      itemId: item._id,
      subject: item.subject,
      standardCode: item.standardCodes[0],
      message: `${field} is empty.`,
      recommendation: "Add a student-readable explanation and worked solution before using this question in reports.",
    }));
  }
}

export function validateQuestion(
  item: Item,
  context: { validStandards?: Set<string>; passageIds?: Set<string> } = {},
): QuestionValidationRow {
  const issues: ValidationIssue[] = [];
  const prompt = questionText(item);

  if (!prompt.trim()) {
    issues.push(issue({
      severity: "error",
      category: "question-quality",
      code: "missing-prompt",
      itemId: item._id,
      subject: item.subject,
      message: "Question prompt is empty.",
      recommendation: "Add a clear student-facing prompt.",
    }));
  }

  if (item.standardCodes.length === 0) {
    issues.push(issue({
      severity: "error",
      category: "question-quality",
      code: "missing-standard",
      itemId: item._id,
      subject: item.subject,
      message: "Question has no TEKS/standard mapping.",
      recommendation: "Attach at least one valid standard code.",
    }));
  }

  if (context.validStandards) {
    for (const code of item.standardCodes) {
      if (!context.validStandards.has(lessonKey(item.subject, code))) {
        issues.push(issue({
          severity: "error",
          category: "question-quality",
          code: "unknown-standard",
          itemId: item._id,
          subject: item.subject,
          standardCode: code,
          message: `Question references unknown standard ${item.subject.toUpperCase()} ${code}.`,
          recommendation: "Fix the standard code or add the missing standard to the imported bundle.",
        }));
      }
    }
  }

  if (item.passageRef && context.passageIds && !context.passageIds.has(item.passageRef)) {
    issues.push(issue({
      severity: "error",
      category: "question-quality",
      code: "missing-passage",
      itemId: item._id,
      subject: item.subject,
      standardCode: item.standardCodes[0],
      message: `Question references missing passage ${item.passageRef}.`,
      recommendation: "Import the referenced passage or update passageRef.",
    }));
  }

  const optionTypes = new Set(["multiple_choice", "multiselect", "inline_choice"]);
  if (optionTypes.has(item.type) && (!item.options || item.options.length < 2)) {
    issues.push(issue({
      severity: "error",
      category: "question-quality",
      code: "missing-options",
      itemId: item._id,
      subject: item.subject,
      standardCode: item.standardCodes[0],
      message: `${item.type} item needs at least two answer choices.`,
      recommendation: "Add complete answer choices with stable keys.",
    }));
  }

  const dupes = duplicateTexts(item.options);
  if (dupes.length > 0) {
    issues.push(issue({
      severity: "warning",
      category: "question-quality",
      code: "duplicate-option-text",
      itemId: item._id,
      subject: item.subject,
      standardCode: item.standardCodes[0],
      message: `Duplicate answer choice text detected: ${dupes.join(", ")}.`,
      recommendation: "Use unique distractors unless the duplicate is intentional and documented.",
    }));
  }

  switch (item.type) {
    case "multiple_choice": {
      const keys = correctOptionKeys(item.options);
      if (keys.length !== 1) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "mc-correct-count",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: `Single-choice item must have exactly one correct option; found ${keys.length}.`,
          recommendation: "Mark exactly one option as correct.",
        }));
      }
      break;
    }
    case "multiselect": {
      const keys = correctOptionKeys(item.options);
      if (keys.length < 2) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "multiselect-correct-count",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: `Multi-select item should have at least two correct options; found ${keys.length}.`,
          recommendation: "Use multiple_choice for one correct answer or mark all required correct options.",
        }));
      }
      const exact = selectExactCount(prompt);
      if (exact !== null && exact !== keys.length) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "select-count-mismatch",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: `Prompt says select ${exact}, but ${keys.length} options are marked correct.`,
          recommendation: "Align the prompt instruction with the answer key.",
        }));
      }
      break;
    }
    case "inline_choice": {
      const optionKeys = new Set((item.options ?? []).map((option) => option.key));
      for (const [blankId, key] of Object.entries(item.blanks ?? {})) {
        if (!optionKeys.has(String(key))) {
          issues.push(issue({
            severity: "error",
            category: "answer-key",
            code: "inline-choice-missing-key",
            itemId: item._id,
            subject: item.subject,
            standardCode: item.standardCodes[0],
            message: `Blank ${blankId} points to option key ${key}, which does not exist.`,
            recommendation: "Use an option key that exists in this item's choices.",
          }));
        }
      }
      break;
    }
    case "text_entry": {
      if (!item.answer && !item.correct && (!item.blanks || Object.keys(item.blanks).length === 0)) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "text-entry-missing-answer",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: "Text-entry item has no answer key.",
          recommendation: "Provide answer, correct, or blanks values.",
        }));
      }
      break;
    }
    case "hot_text": {
      const tokenIds = new Set((item.tokens ?? []).map((token) => token.id));
      const keys = Array.isArray(item.correct) ? item.correct.map(String) : item.correct ? [String(item.correct)] : [];
      if (keys.length === 0) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "hot-text-missing-correct",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: "Hot-text item has no correct token ids.",
          recommendation: "Set correct to the exact token ids students must select.",
        }));
      }
      for (const key of keys) {
        if (!tokenIds.has(key)) {
          issues.push(issue({
            severity: "error",
            category: "answer-key",
            code: "hot-text-unknown-token",
            itemId: item._id,
            subject: item.subject,
            standardCode: item.standardCodes[0],
            message: `Correct token ${key} is not present in tokens.`,
            recommendation: "Fix the correct token id or token list.",
          }));
        }
      }
      break;
    }
    case "drag_and_drop": {
      const draggableIds = new Set((item.draggables ?? []).map((drag) => drag.id));
      for (const target of item.targets ?? []) {
        if (target.accepts.length === 0) {
          issues.push(issue({
            severity: "error",
            category: "answer-key",
            code: "drag-target-empty",
            itemId: item._id,
            subject: item.subject,
            standardCode: item.standardCodes[0],
            message: `Drag target ${target.id} has no accepted answers.`,
            recommendation: "Add at least one accepted draggable id.",
          }));
        }
        for (const accepted of target.accepts) {
          if (!draggableIds.has(accepted)) {
            issues.push(issue({
              severity: "error",
              category: "answer-key",
              code: "drag-target-unknown-draggable",
              itemId: item._id,
              subject: item.subject,
              standardCode: item.standardCodes[0],
              message: `Drag target ${target.id} accepts unknown draggable ${accepted}.`,
              recommendation: "Fix the target accepts list.",
            }));
          }
        }
      }
      break;
    }
    case "multipart": {
      if (!item.parts || item.parts.length === 0) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "multipart-missing-parts",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: "Multipart item has no parts.",
          recommendation: "Add Part A/Part B definitions or use a simpler item type.",
        }));
      }
      break;
    }
    case "scr":
    case "ecr": {
      if (!item.rubric || item.rubric.criteria.length === 0) {
        issues.push(issue({
          severity: "error",
          category: "answer-key",
          code: "written-missing-rubric",
          itemId: item._id,
          subject: item.subject,
          standardCode: item.standardCodes[0],
          message: "Written item has no scoring rubric.",
          recommendation: "Add rubric criteria before using this item in exams.",
        }));
      }
      break;
    }
  }

  requireNonemptyRich(item, "explanation", issues);
  requireNonemptyRich(item, "workedSolution", issues);

  return {
    itemId: item._id,
    subject: item.subject,
    standardCodes: item.standardCodes,
    type: item.type,
    prompt,
    status: issues.some((entry) => entry.severity === "error") ? "FAIL" : "PASS",
    issues,
  };
}

function lessonTitle(lessons: Map<string, LessonDoc>, subject: string, standardCode: string): string {
  return lessons.get(lessonKey(subject, standardCode))?.title ?? `${subject.toUpperCase()} ${standardCode}`;
}

function buildScheduleReport(input: {
  schedule: Schedule;
  lessons: Map<string, LessonDoc>;
  bankBySubject: Record<string, Item[]>;
  issues: ValidationIssue[];
}): ScheduleDayReport[] {
  const taughtBySubject: Record<string, string[]> = {};
  const rows: ScheduleDayReport[] = [];

  for (const day of input.schedule.days) {
    const dayIssues: ValidationIssue[] = [];
    const tasks = day.tasks.map((task) => ({
      id: task.id,
      kind: task.kind,
      subject: taskSubject(task),
      standardCode: taskTopic(task),
      title: task.kind === "exam" ? task.title : lessonTitle(input.lessons, taskSubject(task), taskTopic(task)),
      status: "PENDING" as const,
    }));

    if (day.dayType === "lessons_practice") {
      const lessonTasks = day.tasks.filter((task) => task.kind === "lesson");
      const practiceTasks = day.tasks.filter((task) => task.kind === "practice");
      if (lessonTasks.length === 0 || practiceTasks.length === 0) {
        dayIssues.push(issue({
          severity: "error",
          category: "schedule",
          code: "missing-lesson-practice-pair",
          dayIndex: day.index,
          date: day.date,
          message: "Lesson day must include lesson and practice tasks.",
          recommendation: "Keep lessons and matching practice together in the scheduler.",
        }));
      }
      for (const lesson of lessonTasks) {
        const subject = taskSubject(lesson);
        const standardCode = taskTopic(lesson);
        if (!input.lessons.has(lessonKey(subject, standardCode))) {
          dayIssues.push(issue({
            severity: "error",
            category: "schedule",
            code: "missing-lesson-content",
            subject,
            standardCode,
            dayIndex: day.index,
            date: day.date,
            message: `No available lesson content found for ${subject.toUpperCase()} ${standardCode}.`,
            recommendation: "Import or author an available lesson for this standard.",
          }));
        }
        const subjectBank = input.bankBySubject[subject] ?? [];
        const previous = taughtBySubject[subject] ?? [];
        const practice = assembleFocusedPractice(subjectBank, standardCode, previous, {
          focusCount: DEFAULT_PRACTICE_FOCUS_COUNT,
          reviewCount: 5,
          reviewPerStandard: 2,
        });
        if (practice.slots.length < DEFAULT_PRACTICE_FOCUS_COUNT) {
          dayIssues.push(issue({
            severity: "error",
            category: "practice-availability",
            code: "insufficient-focused-practice",
            subject,
            standardCode,
            dayIndex: day.index,
            date: day.date,
            message: `${subject.toUpperCase()} ${standardCode} generated ${practice.slots.length} practice questions; expected at least ${DEFAULT_PRACTICE_FOCUS_COUNT}.`,
            recommendation: "Add at least one auto-scorable item for this standard so the focused practice can cycle stable virtual slots.",
          }));
        }
      }
      for (const task of lessonTasks) {
        const subject = taskSubject(task);
        const topic = taskTopic(task);
        if (subject && topic) {
          taughtBySubject[subject] = [...(taughtBySubject[subject] ?? []), topic];
        }
      }
    }

    input.issues.push(...dayIssues);
    rows.push({
      day: day.index + 1,
      date: day.date,
      weekday: weekday(day.date),
      dayType: day.dayType ?? "empty",
      remainingAfter: day.remainingAfter ?? 0,
      tasks,
      lessonRanges: (day.lessonRanges ?? []).map((range) => `${range.subject.toUpperCase()} ${range.from}-${range.to}: ${range.topics.join(", ")}`),
      issues: dayIssues,
    });
  }

  return rows;
}

function taughtTopicsBeforeDay(schedule: Schedule, target: DayPlan): Record<string, string[]> {
  const taught: Record<string, string[]> = {};
  for (const day of schedule.days) {
    if (day.index >= target.index) break;
    for (const range of day.lessonRanges ?? []) {
      taught[range.subject] = [...(taught[range.subject] ?? []), ...range.topics];
    }
  }
  return taught;
}

function allTaught(taught: Record<string, string[]>): string[] {
  return [...new Set(Object.values(taught).flat())];
}

function examReadiness(input: {
  schedule: Schedule;
  program: Program;
  bankBySubject: Record<string, Item[]>;
  questionRows: QuestionValidationRow[];
  issues: ValidationIssue[];
}): ExamReadinessRow[] {
  const validItemIds = new Set(input.questionRows.filter((row) => row.status === "PASS").map((row) => row.itemId));
  const used = new Set<string>();
  const rows: ExamReadinessRow[] = [];

  for (const day of input.schedule.days) {
    const exam = day.tasks.find((task) => task.kind === "exam");
    if (!exam) continue;
    const dayIssues: ValidationIssue[] = [];
    const taught = taughtTopicsBeforeDay(input.schedule, day);
    const completed = allTaught(taught);
    const bankBySubject: Record<string, Item[]> = {};
    const availableBySubject: Record<string, number> = {};
    for (const subject of input.program.subjects) {
      const candidates = (input.bankBySubject[subject] ?? []).filter((item) => {
        return validItemIds.has(item._id) && item.standardCodes.length > 0 && item.standardCodes.every((code) => completed.includes(code)) && !used.has(item._id);
      });
      bankBySubject[subject] = candidates;
      availableBySubject[subject] = candidates.length;
    }
    const assembled = assembleExam({
      subjects: input.program.subjects,
      bankBySubject,
      completedTopics: completed,
      weakTopics: [],
      usedIds: used,
      splitPct: input.program.examBlueprint.defaultSplitPct,
      totalItems: DEFAULT_EXAM_ITEM_COUNT,
      durationSeconds: (exam.durationMinutes ?? 180) * 60,
      breakSeconds: input.program.examBlueprint.breakSeconds,
    });
    if (completed.length === 0) {
      dayIssues.push(issue({
        severity: "error",
        category: "exam-readiness",
        code: "exam-no-completed-topics",
        dayIndex: day.index,
        date: day.date,
        message: "Exam appears before any completed lesson topics.",
        recommendation: "Convert early exam slots to lesson days until the theta threshold is met.",
      }));
    }
    if (assembled.itemIds.length < DEFAULT_EXAM_ITEM_COUNT) {
      dayIssues.push(issue({
        severity: "error",
        category: "exam-readiness",
        code: "insufficient-exam-pool",
        dayIndex: day.index,
        date: day.date,
        message: `Exam assembled ${assembled.itemIds.length}/${DEFAULT_EXAM_ITEM_COUNT} valid no-repeat questions from completed topics.`,
        recommendation: "Add valid questions to completed topic pools or reduce the exam item count.",
      }));
    }
    for (const itemId of assembled.itemIds) used.add(itemId);
    input.issues.push(...dayIssues);
    rows.push({
      day: day.index + 1,
      date: day.date,
      weekday: weekday(day.date),
      durationMinutes: exam.durationMinutes ?? 0,
      completedTopicsBeforeExam: completed,
      availableBySubject,
      assembledItemCount: assembled.itemIds.length,
      status: dayIssues.some((entry) => entry.severity === "error") ? "FAIL" : "PASS",
      issues: dayIssues,
    });
  }

  return rows;
}

export function buildValidationReport(dataset: ValidationDataset, options: ValidationOptions = {}): ValidationReport {
  const programArg = options.programArg ?? DEFAULT_PROGRAM_ARG;
  const programKey = normalizeProgramKey(programArg);
  const startDate = options.startDate ?? todayInCentral();
  const targetDays = options.days ?? dataset.program.targetDays ?? DEFAULT_TARGET_DAYS;
  const reportDir = options.reportDir ?? DEFAULT_REPORT_DIR;
  const issues: ValidationIssue[] = [];
  const topicsBySubject = topicsBySubjectFromData(dataset);
  const schedule = buildSchedule({
    startDate,
    targetDays,
    subjects: dataset.program.subjects,
    topicsBySubject,
    quotaBySubject: programKey === DEFAULT_PROGRAM_KEY ? { math: 2, rla: 1 } : undefined,
    lessonWeekdays: [1, 2, 3, 4],
    examWeekdays: [5, 6, 0],
    theta: 4,
    longExamMinutes: 180,
    shortExamMinutes: 60,
  });

  const validStandards = new Set(dataset.standards.map((standard) => lessonKey(standard.subject, standard.code)));
  const passageIds = new Set((dataset.passages ?? []).map((passage) => passage.id));
  const questions = dataset.items.map((item) => validateQuestion(item, { validStandards, passageIds }));
  for (const row of questions) issues.push(...row.issues);

  const lessons = new Map(
    dataset.lessons
      .filter((lesson) => lesson.status === "available")
      .map((lesson) => [lessonKey(lesson.subject, lesson.standardCode), lesson]),
  );
  const bankBySubject: Record<string, Item[]> = {};
  for (const subject of dataset.program.subjects) {
    bankBySubject[subject] = dataset.items.filter((item) => item.programKey === dataset.program.key && item.subject === subject && item.type !== "scr" && item.type !== "ecr");
  }

  const scheduleRows = buildScheduleReport({ schedule, lessons, bankBySubject, issues });
  const exams = examReadiness({ schedule, program: dataset.program, bankBySubject, questionRows: questions, issues });

  const mathTopics = topicsBySubject.math?.length ?? 0;
  const rlaTopics = topicsBySubject.rla?.length ?? 0;
  if (mathTopics < 44 && programKey === DEFAULT_PROGRAM_KEY) {
    issues.push(issue({
      severity: "warning",
      category: "content-coverage",
      code: "math-topic-count-low",
      subject: "math",
      message: `Grade 3 STAAR Math has ${mathTopics} standards in the bank; expected about 44.`,
      recommendation: "Confirm the full Math TEKS sequence is imported.",
    }));
  }
  if (rlaTopics < 10 && programKey === DEFAULT_PROGRAM_KEY) {
    issues.push(issue({
      severity: "error",
      category: "content-coverage",
      code: "rla-topic-count-low",
      subject: "rla",
      message: `Grade 3 STAAR RLA has ${rlaTopics} standards in the bank; expected at least 10.`,
      recommendation: "Import or author the missing RLA topics before validating the full student journey.",
    }));
  }

  const errors = issues.filter((entry) => entry.severity === "error").length;
  const warnings = issues.filter((entry) => entry.severity === "warning").length;
  const endDate = schedule.days.at(-1)?.date ?? addDays(startDate, targetDays - 1);
  const invalidQuestions = questions.filter((row) => row.status === "FAIL").length;
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      studentEmail: options.studentEmail ?? VALIDATION_STUDENT_EMAIL,
      studentName: options.studentName ?? VALIDATION_STUDENT_NAME,
      parentName: options.parentName ?? VALIDATION_PARENT_NAME,
      parentEmail: options.parentEmail ?? VALIDATION_PARENT_EMAIL,
      programArg,
      programKey,
      programTitle: dataset.program.title,
      startDate,
      endDate,
      targetDays,
      reportDir,
    },
    status: errors > 0 ? "FAIL" : "PASS",
    totals: {
      scheduleDays: schedule.days.length,
      lessonDays: schedule.days.filter((day) => day.dayType === "lessons_practice").length,
      longExamDays: schedule.days.filter((day) => day.dayType === "exam_long").length,
      shortExamDays: schedule.days.filter((day) => day.dayType === "exam_short").length,
      mathTopics,
      rlaTopics,
      lessons: dataset.lessons.filter((lesson) => lesson.status === "available").length,
      items: dataset.items.length,
      validQuestions: questions.length - invalidQuestions,
      invalidQuestions,
      warnings,
      errors,
    },
    issues,
    schedule: scheduleRows,
    questions,
    exams,
    fixesApplied: [
      "Validation scripts use the existing pure scheduler so sick/off, acceleration, lesson/practice pairing, and exam tail rules are checked against production logic.",
      "Question validation verifies single-choice, multi-select exactness, prompt/count alignment, missing passages, missing standards, and explanation/worked-solution coverage.",
      "Reward validation exercises the deterministic scorer and signed practiceAward helper so wrong answers deduct instead of earning Robux.",
      "Cleanup planning is dry-run by default and requires exact email confirmation before deleting validation-only records.",
    ],
  };
}

function mdIssueList(issues: ValidationIssue[], empty = "No issues found."): string {
  if (issues.length === 0) return empty;
  return issues
    .map((entry) => {
      const where = [entry.date, entry.subject?.toUpperCase(), entry.standardCode, entry.itemId].filter(Boolean).join(" · ");
      return `- **${entry.severity.toUpperCase()} ${entry.code}**${where ? ` (${where})` : ""}: ${entry.message}${entry.recommendation ? ` Recommendation: ${entry.recommendation}` : ""}`;
    })
    .join("\n");
}

function scheduleMarkdown(report: ValidationReport): string {
  const rows = report.schedule.map((day) => {
    const taskText = day.tasks
      .map((task) => `${task.kind}${task.subject ? ` ${task.subject.toUpperCase()} ${task.standardCode}` : ""}`)
      .join("<br>");
    return `| ${day.day} | ${day.date} | ${day.weekday} | ${day.dayType} | ${taskText || "None"} | ${day.remainingAfter} |`;
  });
  return [
    `# Grade 3 STAAR 45-Day Schedule`,
    ``,
    `Student: ${report.metadata.studentName} (${report.metadata.studentEmail})`,
    `Parent/guardian: ${report.metadata.parentName} (${report.metadata.parentEmail})`,
    `Program: ${report.metadata.programTitle}`,
    `Window: ${report.metadata.startDate} to ${report.metadata.endDate}`,
    ``,
    `| Day | Date | Weekday | Type | Tasks | Remaining |`,
    `|---:|---|---|---|---|---:|`,
    ...rows,
    ``,
    `## Schedule Issues`,
    mdIssueList(report.issues.filter((entry) => entry.category === "schedule" || entry.category === "practice-availability")),
    ``,
  ].join("\n");
}

function summaryMarkdown(report: ValidationReport): string {
  return [
    `# Grade 3 STAAR 45-Day Validation Summary`,
    ``,
    `Status: **${report.status}**`,
    `Generated: ${report.metadata.generatedAt}`,
    ``,
    `## Validation Student`,
    `- Student: ${report.metadata.studentName} (${report.metadata.studentEmail})`,
    `- Parent/guardian: ${report.metadata.parentName} (${report.metadata.parentEmail})`,
    `- Program: ${report.metadata.programTitle} (${report.metadata.programKey})`,
    `- Start date: ${report.metadata.startDate}`,
    `- End date: ${report.metadata.endDate}`,
    ``,
    `## Totals`,
    `- Schedule days: ${report.totals.scheduleDays}`,
    `- Lesson/practice days: ${report.totals.lessonDays}`,
    `- 3-hour exam days: ${report.totals.longExamDays}`,
    `- 1-hour exam days: ${report.totals.shortExamDays}`,
    `- Lessons available: ${report.totals.lessons}`,
    `- Source questions: ${report.totals.items}`,
    `- Valid questions: ${report.totals.validQuestions}`,
    `- Invalid questions: ${report.totals.invalidQuestions}`,
    `- Errors: ${report.totals.errors}`,
    `- Warnings: ${report.totals.warnings}`,
    ``,
    `## Findings`,
    mdIssueList(report.issues),
    ``,
  ].join("\n");
}

function examMarkdown(report: ValidationReport): string {
  return [
    `# Grade 3 STAAR Exam Readiness`,
    ``,
    `| Day | Date | Weekday | Duration | Completed topics before exam | Assembled questions | Status |`,
    `|---:|---|---|---:|---|---:|---|`,
    ...report.exams.map((exam) => `| ${exam.day} | ${exam.date} | ${exam.weekday} | ${exam.durationMinutes} | ${exam.completedTopicsBeforeExam.join(", ") || "None"} | ${exam.assembledItemCount} | ${exam.status} |`),
    ``,
    `## Exam Issues`,
    mdIssueList(report.exams.flatMap((exam) => exam.issues)),
    ``,
  ].join("\n");
}

function fixesMarkdown(report: ValidationReport): string {
  return [
    `# Grade 3 STAAR Fixes Applied / Validation Guards`,
    ``,
    ...report.fixesApplied.map((line) => `- ${line}`),
    ``,
    `## Remaining Required Fixes`,
    mdIssueList(report.issues.filter((entry) => entry.severity === "error"), "No blocking validation errors remain."),
    ``,
  ].join("\n");
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function questionCsv(report: ValidationReport): string {
  const header = ["itemId", "subject", "standardCodes", "type", "status", "issueCount", "issues", "prompt"];
  const rows = report.questions.map((row) => [
    row.itemId,
    row.subject,
    row.standardCodes.join(";"),
    row.type,
    row.status,
    row.issues.length,
    row.issues.map((entry) => `${entry.severity}:${entry.code}:${entry.message}`).join(" | "),
    row.prompt,
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

export async function writeValidationReports(report: ValidationReport, outputDir = report.metadata.reportDir): Promise<string[]> {
  const dir = path.resolve(outputDir);
  await mkdir(path.join(dir, "screenshots"), { recursive: true });
  const files = [
    ["grade3-staar-45-day-validation-summary.md", summaryMarkdown(report)],
    ["grade3-staar-45-day-schedule.md", scheduleMarkdown(report)],
    ["grade3-staar-45-day-question-validation.json", JSON.stringify(report, null, 2) + "\n"],
    ["grade3-staar-45-day-question-validation.csv", questionCsv(report)],
    ["grade3-staar-45-day-exam-readiness.md", examMarkdown(report)],
    ["grade3-staar-45-day-fixes-applied.md", fixesMarkdown(report)],
  ] as const;
  const written: string[] = [];
  for (const [name, contents] of files) {
    const target = path.join(dir, name);
    await writeFile(target, contents, "utf8");
    written.push(target);
  }
  await writeFile(
    path.join(dir, "screenshots", "README.md"),
    [
      "# Screenshots",
      "",
      "Run `bun run validate:grade3:reports-ui -- --baseUrl=http://localhost:5173` after starting the app to validate the report viewer route.",
      "The current repository does not include Playwright, so this script verifies the HTML route without committing browser binary artifacts.",
      "",
    ].join("\n"),
    "utf8",
  );
  return written;
}

export async function readValidationReport(reportDir = DEFAULT_REPORT_DIR): Promise<ValidationReport | null> {
  const file = path.resolve(reportDir, "grade3-staar-45-day-question-validation.json");
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as ValidationReport;
}

export async function clearReportDir(reportDir = DEFAULT_REPORT_DIR): Promise<void> {
  await rm(path.resolve(reportDir), { recursive: true, force: true });
}

export function validateRewardAndScoringGuards(sampleItem: Item): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const correctKeys = correctOptionKeys(sampleItem.options);
  const correct = correctKeys[0] ?? "";
  const wrong = (sampleItem.options ?? []).find((option) => !option.correct)?.key ?? "";
  if (correct) {
    const result = scoreItem(sampleItem, correct);
    if (!result.correct || practiceAward(result.correct, false, 5, 5) !== 5) {
      issues.push(issue({
        severity: "error",
        category: "reward",
        code: "correct-answer-not-awarded",
        itemId: sampleItem._id,
        subject: sampleItem.subject,
        standardCode: sampleItem.standardCodes[0],
        message: "A known correct single-choice answer did not score/award as expected.",
      }));
    }
  }
  if (wrong) {
    const result = scoreItem(sampleItem, wrong);
    if (result.correct || practiceAward(result.correct, false, 5, 5) !== -5) {
      issues.push(issue({
        severity: "error",
        category: "reward",
        code: "wrong-answer-not-penalized",
        itemId: sampleItem._id,
        subject: sampleItem.subject,
        standardCode: sampleItem.standardCodes[0],
        message: "A known wrong single-choice answer did not score as wrong and deduct Robux.",
      }));
    }
  }
  return issues;
}

export function planValidationCleanup(input: {
  studentEmail?: string;
  parentEmail?: string;
  programArg?: string;
  confirmEmail?: string;
  dryRun?: boolean;
  force?: boolean;
  deleteReports?: boolean;
  studentUserId?: string | null;
  parentUserId?: string | null;
  enrollmentId?: string | null;
}): CleanupPlan {
  const studentEmail = (input.studentEmail ?? VALIDATION_STUDENT_EMAIL).toLowerCase();
  const parentEmail = (input.parentEmail ?? VALIDATION_PARENT_EMAIL).toLowerCase();
  const programKey = normalizeProgramKey(input.programArg ?? DEFAULT_PROGRAM_ARG);
  const dryRun = input.dryRun ?? true;
  const confirmEmail = (input.confirmEmail ?? "").toLowerCase();
  const operations: string[] = [];
  if (input.enrollmentId) {
    operations.push(`Delete validation progress, responses, usage, exams, ledger, schedules, and enrollment ${input.enrollmentId}`);
  } else {
    operations.push(`No matching enrollment found for ${studentEmail} / ${programKey}`);
  }
  if (input.studentUserId) operations.push(`Delete validation student user ${input.studentUserId}`);
  else operations.push(`No validation student user found for ${studentEmail}`);
  if (input.parentUserId) operations.push(`Unlink validation student from parent user ${input.parentUserId}`);
  if (input.deleteReports) operations.push(`Delete ${DEFAULT_REPORT_DIR}/ validation reports`);

  const safeToExecute = confirmEmail === studentEmail && (!!input.enrollmentId || !!input.studentUserId);
  const reason = safeToExecute
    ? dryRun
      ? "Dry run only. Pass --dryRun=false with the same --confirmEmail to execute."
      : "Exact student email confirmation supplied."
    : `Refusing execution until --confirmEmail=${studentEmail} is supplied and a target student/enrollment is found.`;
  return { dryRun, safeToExecute, reason, studentEmail, parentEmail, programKey, confirmEmail, operations };
}
