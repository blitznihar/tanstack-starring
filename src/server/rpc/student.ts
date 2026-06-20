import { createServerFn } from "@tanstack/react-start";
import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { rewardPanel } from "~/server/gamification/gamification.js";
import { getOrCreateSchedule } from "~/server/scheduler/scheduler.js";
import { studentOverview } from "~/server/reporting/reporting.js";
import { requireAuth } from "./context.js";

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function progressPct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/** Student landing page data: programs, progress, wallet, exams, and today/week tasks. */
export const studentHome = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  if (!auth.roles.includes("student")) throw new Error("Forbidden: student dashboard is only available to student profiles");

  const [enrollments, programs, overview] = await Promise.all([
    enrollmentsRepo.listForStudent(auth.userId),
    programsRepo.list(),
    studentOverview(auth, auth.userId),
  ]);
  const activeEnrollments = enrollments.filter((enrollment) => enrollment.status === "active" && enrollment._id);
  const programByKey = new Map(programs.map((program) => [program.key, program]));
  const reportByEnrollment = new Map(overview.perProgram.map((report) => [report.enrollmentId, report]));

  const standardLabels = new Map<string, string>();
  for (const enrollment of activeEnrollments) {
    const program = programByKey.get(enrollment.programKey);
    for (const subject of program?.subjects ?? []) {
      const standards = await contentRepo.listStandards(enrollment.programKey, subject);
      for (const standard of standards) standardLabels.set(standard.code, standard.description || standard.code);
    }
  }

  const programViews = [];
  for (const enrollment of activeEnrollments) {
    const enrollmentId = String(enrollment._id);
    const program = programByKey.get(enrollment.programKey);
    const report = reportByEnrollment.get(enrollmentId);
    const schedule = await getOrCreateSchedule(auth, enrollmentId);
    const currentDay = schedule.schedule.days[schedule.currentDay] ?? schedule.schedule.days.find((day) => day.status === "scheduled");
    const upcomingDays = schedule.schedule.days
      .filter((day) => day.index >= schedule.currentDay && day.status === "scheduled")
      .slice(0, 5);
    const exams = schedule.schedule.days
      .filter((day) => day.index >= schedule.currentDay && day.tasks.some((task) => task.kind === "exam"))
      .slice(0, 4)
      .map((day) => ({
        date: day.date,
        label: formatDate(day.date),
        title: day.tasks.find((task) => task.kind === "exam")?.title ?? "Progressive exam",
        programTitle: program?.title ?? enrollment.programKey,
      }));

    let rewards: Awaited<ReturnType<typeof rewardPanel>> = [];
    try {
      rewards = await rewardPanel(auth, enrollmentId);
    } catch {
      rewards = [];
    }

    programViews.push({
      enrollmentId,
      programKey: enrollment.programKey,
      title: program?.title ?? enrollment.programKey,
      category: program?.category ?? "Program",
      subjects: program?.subjects ?? [],
      targetDays: enrollment.targetDays,
      progressPct: progressPct(report?.topicsCompleted ?? 0, report?.topicsTotal ?? 0),
      topicsCompleted: report?.topicsCompleted ?? 0,
      topicsTotal: report?.topicsTotal ?? 0,
      streak: schedule.streak,
      currentDay: schedule.currentDay,
      robuxAvailable: report?.wallet.available ?? 0,
      robuxLifetime: report?.wallet.lifetime ?? 0,
      rewards,
      earnedRewards: rewards.filter((reward) => reward.met).map((reward) => reward.prize),
      todayTasks: (currentDay?.tasks ?? []).map((task) => {
        const label = task.topic ? standardLabels.get(task.topic) ?? task.topic : task.title;
        return {
          id: task.id,
          kind: task.kind,
          subjectKey: task.subject ?? "",
          subject: task.subject ? titleCase(task.subject) : "Exam",
          topic: task.topic ?? "",
          title: task.kind === "exam" ? task.title : label,
          meta: task.topic ? task.topic : `${titleCase(task.kind)} task`,
        };
      }),
      week: upcomingDays.map((day) => {
        const firstTask = day.tasks[0];
        const exam = day.tasks.some((task) => task.kind === "exam");
        const topic = firstTask?.topic ?? "";
        return {
          index: day.index,
          dayLabel: new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
          dateLabel: formatDate(day.date),
          title: exam ? "Progressive exam" : (standardLabels.get(topic) ?? (topic || firstTask?.title || "Practice")),
          type: exam ? "Exam" : titleCase(firstTask?.kind ?? "practice"),
          status: day.status,
          scoreLabel: day.status === "done" ? "Done" : `${Math.min(99, Math.max(0, progressPct(report?.topicsCompleted ?? 0, report?.topicsTotal ?? 1)))}%`,
        };
      }),
      exams,
    });
  }

  const primary = programViews[0] ?? null;
  return {
    displayName: auth.displayName,
    firstName: auth.displayName.split(/\s+/)[0] ?? auth.displayName,
    programs: programViews,
    primary,
    overall: {
      availableRobux: overview.overall.availableRobux,
      lifetimeRobux: overview.overall.lifetimeRobux,
      maxStreak: programViews.reduce((max, program) => Math.max(max, program.streak), 0),
      programCount: programViews.length,
      topicsCompleted: overview.overall.topicsCompleted,
      topicsTotal: overview.overall.topicsTotal,
    },
    scheduledExams: programViews.flatMap((program) => program.exams).slice(0, 5),
  };
});
