import { createServerFn } from "@tanstack/react-start";
import { contentRepo } from "~/repositories/content.js";
import { lessonsRepo } from "~/repositories/lessons.js";
import { getOrCreateSchedule } from "~/server/scheduler/scheduler.js";
import { richToText } from "~/lib/richText.js";
import { requireAuth } from "./context.js";
import { resolvePracticeEnrollment } from "./practice.js";

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
  .validator((d?: { subject?: string }) => ({ subject: d?.subject ?? "math" }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!auth.roles.includes("student")) throw new Error("Forbidden: lessons are only available to student profiles");
    const enrollment = await resolvePracticeEnrollment(auth.userId, data.subject);
    if (!enrollment?._id) return { available: false as const, displayName: auth.displayName };

    const schedule = await getOrCreateSchedule(auth, enrollment._id);
    const currentDay = schedule.schedule.days[schedule.currentDay] ?? schedule.schedule.days.find((day) => day.status === "scheduled");
    const lessonTask =
      currentDay?.tasks.find((task) => task.subject === data.subject && task.kind === "lesson" && task.topic) ??
      currentDay?.tasks.find((task) => task.subject === data.subject && task.topic);

    const standards = await contentRepo.listStandards(enrollment.programKey, data.subject);
    const standardCode = lessonTask?.topic ?? standards[0]?.code ?? "";
    if (!standardCode) return { available: false as const, displayName: auth.displayName };

    const standard = standards.find((entry) => entry.code === standardCode);
    const description = standard?.description ?? standardCode;
    const [items, authoredLesson] = await Promise.all([
      contentRepo.listItemsByStandard(enrollment.programKey, data.subject, standardCode),
      lessonsRepo.findAvailable(enrollment.programKey, data.subject, standardCode),
    ]);
    const examples = items
      .filter((item) => item.type !== "scr" && item.type !== "ecr")
      .slice(0, 3)
      .map((item, index) => ({
        num: index + 1,
        prompt: richToText(item.prompt),
        solution: richToText(item.workedSolution) || richToText(item.explanation),
      }));

    return {
      available: true as const,
      displayName: auth.displayName,
      firstName: auth.displayName.split(/\s+/)[0] ?? auth.displayName,
      enrollmentId: enrollment._id,
      programKey: enrollment.programKey,
      subject: data.subject,
      subjectLabel: SUBJECT_LABELS[data.subject] ?? titleCase(data.subject),
      standardCode,
      source: authoredLesson ? "authored" as const : "generated" as const,
      title: authoredLesson?.title ?? description,
      reportingCategory: authoredLesson?.reportingCategory ?? standard?.reportingCategory ?? "Lesson",
      intro: authoredLesson?.intro ?? shortIntro(description, data.subject),
      vocabulary: authoredLesson?.vocabulary.length ? authoredLesson.vocabulary : vocabulary(description, data.subject),
      body: authoredLesson?.body ?? [],
      visualKind: authoredLesson?.visualKind ?? visualKind(description, data.subject),
      examples,
      practiceExamples: authoredLesson?.practiceExamples ?? [],
    };
  });
