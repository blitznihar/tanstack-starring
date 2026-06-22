import { createServerFn } from "@tanstack/react-start";
import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { itemUsageRepo } from "~/repositories/itemUsage.js";
import { lessonsRepo } from "~/repositories/lessons.js";
import { lessonProgressRepo } from "~/repositories/lessonProgress.js";
import { practiceProgressRepo } from "~/repositories/practiceProgress.js";
import { responsesRepo } from "~/repositories/responses.js";
import { robuxLedgerRepo } from "~/repositories/robuxLedger.js";
import { schedulesRepo } from "~/repositories/schedules.js";
import { sourceItemIdFromPracticeId } from "~/domain/practice/practice.js";
import { getOrCreateSchedule } from "~/server/scheduler/scheduler.js";
import { reopenDayForTopic, type Schedule } from "~/domain/scheduler/scheduler.js";
import { richToText } from "~/lib/richText.js";
import { assertCanSeeStudent } from "~/server/users/associations.js";
import { requireAuth } from "./context.js";
import { resolvePracticeEnrollment } from "./practice.js";
import type { AuthContext } from "~/server/auth/session.js";

const SUBJECT_LABELS: Record<string, string> = {
  math: "Math",
  rla: "Reading",
};

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortIntro(description: string, subject: string): string {
  if (subject === "rla") {
    return `${description} means slowing down, looking for clues in the text, and proving your answer with evidence.`;
  }
  return `${description} is easier when you name what you know, choose a model, and check each step before answering.`;
}

function vocabulary(description: string, subject: string): { term: string; meaning: string }[] {
  const lower = description.toLowerCase();
  if (lower.includes("fraction")) {
    return [
      { term: "Numerator", meaning: "top number" },
      { term: "Denominator", meaning: "equal parts" },
      { term: "Equal parts", meaning: "same size" },
    ];
  }
  if (lower.includes("place value")) {
    return [
      { term: "Digit", meaning: "one number symbol" },
      { term: "Place", meaning: "where a digit sits" },
      { term: "Value", meaning: "what the digit is worth" },
    ];
  }
  if (lower.includes("multiplication") || lower.includes("division")) {
    return [
      { term: "Groups", meaning: "equal sets" },
      { term: "Factor", meaning: "numbers multiplied" },
      { term: "Quotient", meaning: "division answer" },
    ];
  }
  if (subject === "rla") {
    return [
      { term: "Evidence", meaning: "proof from text" },
      { term: "Inference", meaning: "smart conclusion" },
      { term: "Central idea", meaning: "main point" },
    ];
  }
  return [
    { term: "Model", meaning: "picture or tool" },
    { term: "Strategy", meaning: "steps that work" },
    { term: "Check", meaning: "make sure it fits" },
  ];
}

function visualKind(description: string, subject: string): "number_line" | "fraction_bars" | "place_value" | "array" | "text_evidence" | "steps" {
  const lower = description.toLowerCase();
  if (lower.includes("number line")) return "number_line";
  if (lower.includes("fraction")) return "fraction_bars";
  if (lower.includes("place value") || lower.includes("comparing")) return "place_value";
  if (lower.includes("multiplication") || lower.includes("array") || lower.includes("division")) return "array";
  if (subject === "rla") return "text_evidence";
  return "steps";
}

export const lessonForToday = createServerFn({ method: "GET" })
  .validator((d?: { subject?: string; standardCode?: string }) => ({ subject: d?.subject ?? "math", standardCode: d?.standardCode }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return lessonForStudent(auth, data.subject, data.standardCode, { preferRequested: true });
  });

async function lessonForStudent(auth: AuthContext, subject: string, requestedStandardCode?: string, options: { preferRequested?: boolean } = {}) {
  if (!auth.roles.includes("student")) throw new Error("Forbidden: lessons are only available to student profiles");
  const enrollment = await resolvePracticeEnrollment(auth.userId, subject);
  if (!enrollment?._id) return { available: false as const, displayName: auth.displayName };

  const schedule = await getOrCreateSchedule(auth, enrollment._id);
  const currentDay = schedule.schedule.days[schedule.currentDay] ?? schedule.schedule.days.find((day) => day.status === "scheduled");
  const standards = await contentRepo.listStandards(enrollment.programKey, subject);
  const lessonTask =
    currentDay?.tasks.find((task) => task.subject === subject && task.kind === "lesson" && task.topic && task.topic === requestedStandardCode) ??
    currentDay?.tasks.find((task) => task.subject === subject && task.kind === "lesson" && task.topic) ??
    currentDay?.tasks.find((task) => task.subject === subject && task.topic);

  let standardCode = lessonTask?.topic ?? standards[0]?.code ?? "";
  const requested = requestedStandardCode?.trim();
  if (options.preferRequested && requested && standards.some((entry) => entry.code === requested)) {
    const [completed, scheduled] = await Promise.all([
      lessonProgressRepo.isComplete(enrollment._id, subject, requested),
      Promise.resolve(schedule.schedule.days.some((day) => day.tasks.some((task) => task.kind === "lesson" && task.subject === subject && task.topic === requested))),
    ]);
    if (completed || scheduled) standardCode = requested;
  }
  if (!standardCode) return { available: false as const, displayName: auth.displayName };

  const standard = standards.find((entry) => entry.code === standardCode);
  const description = standard?.description ?? standardCode;
  const [items, authoredLesson, completed, practiceCompleted] = await Promise.all([
    contentRepo.listItemsByStandard(enrollment.programKey, subject, standardCode),
    lessonsRepo.findAvailable(enrollment.programKey, subject, standardCode),
    lessonProgressRepo.isComplete(enrollment._id, subject, standardCode),
    practiceProgressRepo.isComplete(enrollment._id, subject, standardCode),
  ]);
  const examples = items
    .filter((item) => item.type !== "scr" && item.type !== "ecr")
    .slice(0, 3)
    .map((item, index) => ({
      num: index + 1,
      source: item.source ?? "generated",
      prompt: richToText(item.prompt),
      solution: richToText(item.workedSolution) || richToText(item.explanation),
    }));

  return {
    available: true as const,
    displayName: auth.displayName,
    firstName: auth.displayName.split(/\s+/)[0] ?? auth.displayName,
    enrollmentId: enrollment._id,
    programKey: enrollment.programKey,
    subject,
    subjectLabel: SUBJECT_LABELS[subject] ?? titleCase(subject),
    standardCode,
    completed,
    practiceCompleted,
    source: authoredLesson ? "authored" as const : "generated" as const,
    title: authoredLesson?.title ?? description,
    reportingCategory: authoredLesson?.reportingCategory ?? standard?.reportingCategory ?? "Lesson",
    intro: authoredLesson?.intro ?? shortIntro(description, subject),
    vocabulary: authoredLesson?.vocabulary.length ? authoredLesson.vocabulary : vocabulary(description, subject),
    body: authoredLesson?.body ?? [],
    visualKind: authoredLesson?.visualKind ?? visualKind(description, subject),
    examples,
    practiceExamples: authoredLesson?.practiceExamples ?? [],
  };
}

export const completeLesson = createServerFn({ method: "POST" })
  .validator((d: { subject: string; standardCode: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const lesson = await lessonForStudent(auth, data.subject, data.standardCode);
    if (!lesson.available) throw new Error("No lesson is ready for this subject.");
    if (lesson.standardCode !== data.standardCode) throw new Error("Complete today's lesson before practicing.");
    await lessonProgressRepo.complete({
      enrollmentId: lesson.enrollmentId,
      programKey: lesson.programKey,
      subject: lesson.subject,
      standardCode: lesson.standardCode,
    });
    return { ...lesson, completed: true };
  });

export const markStudentLessonUndone = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; subject: string; standardCode: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.roles.includes("super_admin")) throw new Error("Forbidden: only a Super Admin can mark lessons undone.");
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (!enrollment?._id) throw new Error("Enrollment not found.");
    await assertCanSeeStudent(auth, enrollment.studentId);

    const [lessonRemoved, practiceRemoved] = await Promise.all([
      lessonProgressRepo.undo(enrollment._id, data.subject, data.standardCode),
      practiceProgressRepo.undo(enrollment._id, data.subject, data.standardCode),
    ]);
    const sourceItems = await contentRepo.listItemsByStandard(enrollment.programKey, data.subject, data.standardCode);
    const sourceItemIds = new Set(sourceItems.map((item) => item._id));
    const practiceResponses = await responsesRepo.listPractice(enrollment._id);
    const releasedResponseIds = practiceResponses
      .filter((response) => sourceItemIds.has(sourceItemIdFromPracticeId(response.itemId)))
      .map((response) => response.itemId);
    const [practiceResponsesRemoved, practiceUsageReleased, practiceLedgerRemoved] = await Promise.all([
      responsesRepo.deletePracticeByItemIds(enrollment._id, releasedResponseIds),
      itemUsageRepo.releaseMany(enrollment._id, [...sourceItemIds], "practice"),
      robuxLedgerRepo.deleteByRefs(enrollment._id, "practice", releasedResponseIds),
    ]);

    const existingSchedule = await schedulesRepo.find(enrollment._id);
    let reopenedScheduleDay = false;
    if (existingSchedule) {
      const schedule: Schedule = {
        startDate: existingSchedule.startDate,
        targetDays: existingSchedule.targetDays,
        days: existingSchedule.days,
        config: existingSchedule.config,
        dayStatus: existingSchedule.dayStatus,
        doneDates: existingSchedule.doneDates,
      };
      const reopened = reopenDayForTopic(schedule, { subject: data.subject, topic: data.standardCode });
      reopenedScheduleDay = reopened.days.some((day, index) => schedule.days[index]?.status === "done" && day.status === "scheduled");
      if (reopenedScheduleDay) await schedulesRepo.save(enrollment._id, reopened);
    }

    return {
      enrollmentId: enrollment._id,
      studentId: enrollment.studentId,
      subject: data.subject,
      standardCode: data.standardCode,
      lessonRemoved,
      practiceRemoved,
      reopenedScheduleDay,
      practiceResponsesRemoved,
      practiceUsageReleased,
      practiceLedgerRemoved,
    };
  });
