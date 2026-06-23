import { createServerFn } from "@tanstack/react-start";
import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { lessonProgressRepo } from "~/repositories/lessonProgress.js";
import { practiceProgressRepo } from "~/repositories/practiceProgress.js";
import { programsRepo } from "~/repositories/programs.js";
import { rewardPanel } from "~/server/gamification/gamification.js";
import { getOrCreateSchedule } from "~/server/scheduler/scheduler.js";
import { studentOverview } from "~/server/reporting/reporting.js";
import { assertCanSeeStudent, publicUserOption, userId, visibleStudentsFor } from "~/server/users/associations.js";
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
  workDate: string;
  subjectKey: string;
  subject: string;
  topic: string;
  title: string;
  meta: string;
  durationMinutes: number | null;
  completed: boolean;
  completedAt: string | null;
};

type ProgressLookup = {
  lessons: Map<string, Date>;
  practices: Map<string, Date>;
};

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function progressKey(subject: string, standardCode: string): string {
  return `${subject}:${standardCode}`;
}

async function buildTaskViews(input: {
  enrollmentId: string;
  day: { date: string; status: string; tasks: { id: string; kind: string; subject?: string; topic?: string; title: string; durationMinutes?: number }[] } | undefined;
  standardLabels: Map<string, string>;
  progress?: ProgressLookup;
}): Promise<TaskView[]> {
  const views: TaskView[] = [];
  for (const task of input.day?.tasks ?? []) {
    const label = task.topic && task.subject ? input.standardLabels.get(`${task.subject}:${task.topic}`) ?? task.topic : task.title;
    const key = task.subject && task.topic ? progressKey(task.subject, task.topic) : "";
    const completedAt =
      task.kind === "lesson"
        ? input.progress?.lessons.get(key) ?? null
        : task.kind === "practice"
          ? input.progress?.practices.get(key) ?? null
          : null;
    const completed =
      input.day?.status === "done" ||
      !!completedAt ||
      (!input.progress && task.kind === "lesson" && task.subject && task.topic
        ? await lessonProgressRepo.isComplete(input.enrollmentId, task.subject, task.topic)
        : !input.progress && task.kind === "practice" && task.subject && task.topic
          ? await practiceProgressRepo.isComplete(input.enrollmentId, task.subject, task.topic)
          : false);
    views.push({
      id: task.id,
      kind: task.kind,
      workDate: input.day?.date ?? "",
      subjectKey: task.subject ?? "",
      subject: task.subject ? titleCase(task.subject) : "Exam",
      topic: task.topic ?? "",
      title: task.kind === "exam" ? task.title : label,
      meta: task.kind === "exam" && task.durationMinutes ? `${task.durationMinutes} minutes` : task.topic ? task.topic : `${titleCase(task.kind)} task`,
      durationMinutes: task.durationMinutes ?? null,
      completed,
      completedAt: completedAt?.toISOString() ?? null,
    });
  }
  return views;
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
      for (const standard of standards) standardLabels.set(`${subject}:${standard.code}`, standard.description || standard.code);
    }
  }

  const programViews = [];
  for (const enrollment of activeEnrollments) {
    const enrollmentId = String(enrollment._id);
    const program = programByKey.get(enrollment.programKey);
    const report = reportByEnrollment.get(enrollmentId);
    const schedule = await getOrCreateSchedule(auth, enrollmentId);
    const calendarDate = todayIso();
    const nextWorkDay = schedule.schedule.days[schedule.currentDay] ?? schedule.schedule.days.find((day) => day.status === "scheduled");
    const [lessonProgress, practiceProgress] = await Promise.all([
      lessonProgressRepo.listForEnrollment(enrollmentId),
      practiceProgressRepo.listForEnrollment(enrollmentId),
    ]);
    const progress: ProgressLookup = {
      lessons: new Map(lessonProgress.map((row) => [progressKey(row.subject, row.standardCode), row.completedAt])),
      practices: new Map(practiceProgress.map((row) => [progressKey(row.subject, row.standardCode), row.completedAt])),
    };
    const taskViewsByDay = new Map<number, TaskView[]>();
    for (const day of schedule.schedule.days) {
      taskViewsByDay.set(day.index, await buildTaskViews({ enrollmentId, day, standardLabels, progress }));
    }
    const nextWorkTasks = nextWorkDay ? taskViewsByDay.get(nextWorkDay.index) ?? [] : [];
    const nextWorkHasStarted = nextWorkTasks.some((task) => task.completed);
    const latestFinishedDay = [...schedule.schedule.days]
      .filter((day) => {
        if (nextWorkDay && day.index >= nextWorkDay.index) return false;
        const views = taskViewsByDay.get(day.index) ?? [];
        return views.length > 0 && views.every((task) => task.completed);
      })
      .at(-1);
    const currentDay = nextWorkHasStarted ? nextWorkDay : latestFinishedDay ?? nextWorkDay;
    const todayTasks = currentDay ? taskViewsByDay.get(currentDay.index) ?? [] : [];
    const weekStartIndex = currentDay?.index ?? schedule.currentDay;
    const upcomingDays = schedule.schedule.days
      .filter((day) => day.index >= weekStartIndex && (day.status === "scheduled" || day.status === "done"))
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

    const nextIncompleteTask = todayTasks.find((task) => !task.completed) ?? null;
    const nextWorkIncompleteTask = nextWorkTasks.find((task) => !task.completed) ?? null;
    const nextWorkCompletedCount = nextWorkTasks.filter((task) => task.completed).length;
    const completedTodayCount = todayTasks.filter((task) => task.completed).length;
    const finishedTodayTasks = todayTasks.filter((task) => task.completed);

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
      calendarDate,
      nextWorkDate: nextWorkDay?.date ?? "",
      todayTasks,
      finishedTodayTasks,
      nextWorkTasks,
      nextIncompleteTask: nextIncompleteTask ?? nextWorkIncompleteTask,
      nextWorkIncompleteTask,
      nextWorkCompletedCount,
      completedTodayCount,
      allTodayCompleted: todayTasks.length > 0 && completedTodayCount === todayTasks.length,
      hasStartedToday: completedTodayCount > 0,
      week: upcomingDays.map((day) => {
        const dayTasks = taskViewsByDay.get(day.index) ?? [];
        const done = dayTasks.length > 0 && dayTasks.every((task) => task.completed);
        const firstTask = day.tasks[0];
        const exam = day.tasks.some((task) => task.kind === "exam");
        const topic = firstTask?.topic ?? "";
        const subject = firstTask?.subject ?? "";
        const completedLessonTitles = dayTasks
          .filter((task) => task.kind === "lesson")
          .map((task) => task.title);
        return {
          index: day.index,
          dayLabel: new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
          dateLabel: formatDate(day.date),
          title: done && completedLessonTitles.length > 0 ? completedLessonTitles.join(" • ") : exam ? (day.tasks.find((task) => task.kind === "exam")?.title ?? "Progressive exam") : (standardLabels.get(`${subject}:${topic}`) ?? (topic || firstTask?.title || "Practice")),
          type: done ? `${dayTasks.length} completed` : exam ? "Exam" : titleCase(firstTask?.kind ?? "practice"),
          status: done ? "done" : day.status,
          scoreLabel: done ? "Done" : `${Math.min(99, Math.max(0, progressPct(report?.topicsCompleted ?? 0, report?.topicsTotal ?? 1)))}%`,
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

/** Student history: completed lessons/practices grouped by schedule date. */
export const studentHistory = createServerFn({ method: "GET" })
  .validator((d?: { studentId?: string }) => ({
    studentId: typeof d?.studentId === "string" && d.studentId.trim() ? d.studentId.trim() : undefined,
  }))
  .handler(async ({ data }) => {
  const auth = await requireAuth();
  const students = await visibleStudentsFor(auth);
  const viewerIsStudent = auth.roles.includes("student");
  const viewerIsParent = auth.roles.includes("parent") && !auth.roles.some((role) => role === "admin" || role === "super_admin");
  const selectedStudentId = viewerIsStudent
    ? auth.userId
    : data.studentId ?? (viewerIsParent && students[0] ? userId(students[0]) : "");

  if (!selectedStudentId) {
    return {
      available: false as const,
      viewer: { displayName: auth.displayName, roles: auth.roles },
      displayName: auth.displayName,
      firstName: auth.displayName.split(/\s+/)[0] ?? auth.displayName,
      studentId: "",
      studentName: "",
      students: students.map(publicUserOption),
      programs: [],
    };
  }

  await assertCanSeeStudent(auth, selectedStudentId);
  const student = students.find((entry) => userId(entry) === selectedStudentId);
  const studentName = student?.displayName ?? (viewerIsStudent ? auth.displayName : "Student");

  const [enrollments, programs] = await Promise.all([
    enrollmentsRepo.listForStudent(selectedStudentId),
    programsRepo.list(),
  ]);
  const activeEnrollments = enrollments.filter((enrollment) => enrollment.status === "active" && enrollment._id);
  const programByKey = new Map(programs.map((program) => [program.key, program]));
  const standardLabels = new Map<string, string>();
  for (const enrollment of activeEnrollments) {
    const program = programByKey.get(enrollment.programKey);
    for (const subject of program?.subjects ?? []) {
      const standards = await contentRepo.listStandards(enrollment.programKey, subject);
      for (const standard of standards) standardLabels.set(`${subject}:${standard.code}`, standard.description || standard.code);
    }
  }

  const programHistories = [];
  for (const enrollment of activeEnrollments) {
    const enrollmentId = String(enrollment._id);
    const program = programByKey.get(enrollment.programKey);
    const schedule = await getOrCreateSchedule(auth, enrollmentId);
    const [lessonProgress, practiceProgress] = await Promise.all([
      lessonProgressRepo.listForEnrollment(enrollmentId),
      practiceProgressRepo.listForEnrollment(enrollmentId),
    ]);
    const progress: ProgressLookup = {
      lessons: new Map(lessonProgress.map((row) => [progressKey(row.subject, row.standardCode), row.completedAt])),
      practices: new Map(practiceProgress.map((row) => [progressKey(row.subject, row.standardCode), row.completedAt])),
    };
    const days = [];
    for (const day of schedule.schedule.days) {
      const tasks = (await buildTaskViews({ enrollmentId, day, standardLabels, progress })).filter((task) => task.completed);
      if (tasks.length === 0) continue;
      days.push({
        index: day.index,
        date: day.date,
        dateLabel: formatDate(day.date),
        tasks,
      });
    }
    programHistories.push({
      enrollmentId,
      programKey: enrollment.programKey,
      title: program?.title ?? enrollment.programKey,
      days: days.sort((a, b) => b.date.localeCompare(a.date)),
    });
  }

  return {
    available: true as const,
    viewer: { displayName: auth.displayName, roles: auth.roles },
    displayName: viewerIsStudent ? auth.displayName : studentName,
    firstName: studentName.split(/\s+/)[0] ?? studentName,
    studentId: selectedStudentId,
    studentName,
    students: students.map(publicUserOption),
    programs: programHistories,
  };
});
