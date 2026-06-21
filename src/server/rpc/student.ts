import { createServerFn } from "@tanstack/react-start";
import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { lessonProgressRepo } from "~/repositories/lessonProgress.js";
import { practiceProgressRepo } from "~/repositories/practiceProgress.js";
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

type TaskView = {
  id: string;
  kind: string;
  subjectKey: string;
  subject: string;
  topic: string;
  title: string;
  meta: string;
  durationMinutes: number | null;
  completed: boolean;
};

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
      for (const standard of standards) standardLabels.set(`${subject}:${standard.code}`, standard.description || standard.code);
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
        durationMinutes: day.tasks.find((task) => task.kind === "exam")?.durationMinutes ?? null,
        programTitle: program?.title ?? enrollment.programKey,
      }));

    let rewards: Awaited<ReturnType<typeof rewardPanel>> = [];
    try {
      rewards = await rewardPanel(auth, enrollmentId);
    } catch {
      rewards = [];
    }

    const todayTasks: TaskView[] = [];
    for (const task of currentDay?.tasks ?? []) {
      const label = task.topic && task.subject ? standardLabels.get(`${task.subject}:${task.topic}`) ?? task.topic : task.title;
      const completed =
        currentDay?.status === "done" ||
        (task.kind === "lesson" && task.subject && task.topic
          ? await lessonProgressRepo.isComplete(enrollmentId, task.subject, task.topic)
          : task.kind === "practice" && task.subject && task.topic
            ? await practiceProgressRepo.isComplete(enrollmentId, task.subject, task.topic)
            : false);
      todayTasks.push({
        id: task.id,
        kind: task.kind,
        subjectKey: task.subject ?? "",
        subject: task.subject ? titleCase(task.subject) : "Exam",
        topic: task.topic ?? "",
        title: task.kind === "exam" ? task.title : label,
        meta: task.kind === "exam" && task.durationMinutes ? `${task.durationMinutes} minutes` : task.topic ? task.topic : `${titleCase(task.kind)} task`,
        durationMinutes: task.durationMinutes ?? null,
        completed,
      });
    }
    const nextIncompleteTask = todayTasks.find((task) => !task.completed) ?? null;
    const completedTodayCount = todayTasks.filter((task) => task.completed).length;

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
      todayDate: currentDay?.date ?? "",
      todayTasks,
      nextIncompleteTask,
      completedTodayCount,
      allTodayCompleted: todayTasks.length > 0 && completedTodayCount === todayTasks.length,
      hasStartedToday: completedTodayCount > 0,
      week: upcomingDays.map((day) => {
        const firstTask = day.tasks[0];
        const exam = day.tasks.some((task) => task.kind === "exam");
        const topic = firstTask?.topic ?? "";
        const subject = firstTask?.subject ?? "";
        return {
          index: day.index,
          dayLabel: new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
          dateLabel: formatDate(day.date),
          title: exam ? (day.tasks.find((task) => task.kind === "exam")?.title ?? "Progressive exam") : (standardLabels.get(`${subject}:${topic}`) ?? (topic || firstTask?.title || "Practice")),
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
