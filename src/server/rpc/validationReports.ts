import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { currentAuth } from "./context.js";

type ValidationIssue = {
  severity: "error" | "warning";
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

type ValidationReport = {
  metadata: {
    generatedAt: string;
    studentEmail: string;
    studentName: string;
    parentName: string;
    parentEmail: string;
    programKey: string;
    programTitle: string;
    startDate: string;
    endDate: string;
    targetDays: number;
  };
  status: "PASS" | "FAIL";
  totals: Record<string, number>;
  issues: ValidationIssue[];
  schedule: Array<{
    day: number;
    date: string;
    weekday: string;
    dayType: string;
    remainingAfter: number;
    tasks: Array<{ id: string; kind: string; subject: string; standardCode: string; title: string; status: string }>;
    issues: ValidationIssue[];
  }>;
  questions: Array<{
    itemId: string;
    subject: string;
    standardCodes: string[];
    type: string;
    prompt: string;
    status: "PASS" | "FAIL";
    issues: ValidationIssue[];
  }>;
  exams: Array<{
    day: number;
    date: string;
    weekday: string;
    durationMinutes: number;
    assembledItemCount: number;
    status: "PASS" | "FAIL";
    issues: ValidationIssue[];
  }>;
};

function canReadValidationReports(roles: string[] | undefined): boolean {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production") return true;
  return !!roles?.some((role) => role === "admin" || role === "super_admin");
}

export const grade3StaarValidationReport = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await currentAuth();
  if (!canReadValidationReports(auth?.roles)) throw new Error("Forbidden: validation reports are admin-only in production.");

  const file = path.resolve("report", "grade3-staar-45-day-question-validation.json");
  if (!existsSync(file)) {
    return {
      available: false as const,
      message: "No Grade 3 STAAR validation report has been generated yet.",
      expectedCommand: "bun run validate:grade3:45day",
    };
  }

  const report = JSON.parse(await readFile(file, "utf8")) as ValidationReport;
  return {
    available: true as const,
    report,
    files: [
      "report/grade3-staar-45-day-validation-summary.md",
      "report/grade3-staar-45-day-schedule.md",
      "report/grade3-staar-45-day-question-validation.json",
      "report/grade3-staar-45-day-question-validation.csv",
      "report/grade3-staar-45-day-exam-readiness.md",
      "report/grade3-staar-45-day-fixes-applied.md",
    ],
  };
});
