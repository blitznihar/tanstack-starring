import { createServerFn } from "@tanstack/react-start";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { clearDayStatus, getOrCreateSchedule, setDayStatus, workAheadDays, completeScheduleDay } from "~/server/scheduler/scheduler.js";
import { accountUnlockedPrograms } from "~/server/billing/billing.js";
import { requireCapability } from "~/server/auth/rbac.js";
import { assertCanSeeStudent, publicUserOption, userId, visibleStudentsFor } from "~/server/users/associations.js";
import { requireAuth } from "./context.js";

type PlanView = {
  enrollmentId: string;
  programKey: string;
  programTitle: string;
  targetDays: number;
  calendarDays: number;
  streak: number;
  currentDay: number;
  currentStudyDay: number;
  days: {
    index: number;
    studyDayNumber: number | null;
    studyDayLabel: string;
    date: string;
    dayName: string;
    dateLabel: string;
    status: string;
    tag: string;
    title: string;
    subject: string;
    durationMinutes: number | null;
    bumped: boolean;
    workloadFactor: number;
    isExam: boolean;
    remainingAfter: number | null;
  }[];
};

function dayLabels(date: string): { dayName: string; dateLabel: string } {
  const parsed = new Date(date + "T00:00:00Z");
  return {
    dayName: parsed.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    dateLabel: parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  };
}

function lessonRangeTitle(ranges: NonNullable<Awaited<ReturnType<typeof getOrCreateSchedule>>["schedule"]["days"][number]["lessonRanges"]>): string {
  return ranges
    .map((range) => {
      const subject = range.subject.toUpperCase();
      const topicPart = range.from === range.to ? String(range.from) : `${range.from}-${range.to}`;
      return `${subject} ${topicPart}`;
    })
    .join(" + ");
}

function toPlanView(enrollmentId: string, programKey: string, programTitle: string, s: Awaited<ReturnType<typeof getOrCreateSchedule>>): PlanView {
  const days = s.schedule.days.map((d) => {
    const exam = d.tasks.some((t) => t.kind === "exam");
    const examTask = d.tasks.find((t) => t.kind === "exam");
    const subjects = [...new Set(d.tasks.filter((t) => t.subject).map((t) => t.subject!))];
    const topicSummary = d.lessonRanges?.length
      ? lessonRangeTitle(d.lessonRanges)
      : subjects
        .map((subject) => {
          const topic = d.tasks.find((task) => task.subject === subject && task.topic)?.topic;
          return topic ? `${subject.toUpperCase()} ${topic}` : subject.toUpperCase();
        })
        .join(" + ");
    const isFlex = d.status === "off" || d.status === "sick";
    const dayNumber = isFlex ? null : (d.programDayEnd ?? null);
    const studyDayLabel = isFlex
      ? "Flex"
      : d.programDayStart && d.programDayEnd && d.programDayStart !== d.programDayEnd
        ? `Day ${d.programDayStart}-${d.programDayEnd}`
        : dayNumber
          ? `Day ${dayNumber}`
          : "Day";
    return {
      index: d.index,
      studyDayNumber: dayNumber,
      studyDayLabel,
      date: d.date,
      ...dayLabels(d.date),
      status: d.status,
      tag: exam ? "EXAM" : d.status === "off" ? "OFF" : d.status === "sick" ? "SICK" : d.tasks.length > d.baseCount ? "ADDED" : "LESSON",
      title: exam ? examTask?.title ?? "Progressive exam" : topicSummary || (d.status === "off" ? "Day off" : d.status === "sick" ? "Sick day" : "Catch-up / review"),
      subject: subjects.join(" + "),
      durationMinutes: examTask?.durationMinutes ?? null,
      bumped: d.workloadFactor > 1,
      workloadFactor: d.workloadFactor,
      isExam: exam,
      remainingAfter: d.remainingAfter ?? null,
    };
  });
  const currentStudyDay = days.find((day) => day.index === s.currentDay)?.studyDayNumber ?? s.schedule.targetDays;
  return {
    enrollmentId,
    programKey,
    programTitle,
    targetDays: s.schedule.targetDays,
    calendarDays: s.schedule.days.length,
    streak: s.streak,
    currentDay: s.currentDay,
    currentStudyDay,
    days,
  };
}

/** Study plans for every active enrollment of the signed-in student (or child). */
export const myPlans = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const enrollments = await enrollmentsRepo.listForStudent(auth.userId);
  const unlocked = await accountUnlockedPrograms();
  const out: PlanView[] = [];
  for (const e of enrollments) {
    if (!e._id) continue;
    // Only show plans for programs unlocked by subscription/demo (§12).
    if (!unlocked.has(e.programKey)) continue;
    const program = await programsRepo.findByKey(e.programKey);
    const s = await getOrCreateSchedule(auth, e._id);
    out.push(toPlanView(e._id, e.programKey, program?.title ?? e.programKey, s));
  }
  return { displayName: auth.displayName, plans: out };
});

/** Admin/parent schedule oversight for associated students. */
export const managedPlans = createServerFn({ method: "GET" })
  .validator((d?: { studentId?: string; autoSelect?: boolean }) => ({
    studentId: d?.studentId,
    autoSelect: d?.autoSelect ?? true,
  }))
  .handler(async ({ data }) => {
  const auth = await requireAuth();
  if (auth.roles.some((r) => r === "admin" || r === "super_admin")) requireCapability(auth.roles, "reports.viewAll");
  else requireCapability(auth.roles, "reports.viewChild");

  const [students, programs] = await Promise.all([visibleStudentsFor(auth), programsRepo.list()]);
  const selectedStudentId = data.studentId || (data.autoSelect && students[0] ? userId(students[0]) : "");
  if (selectedStudentId) await assertCanSeeStudent(auth, selectedStudentId);
  const programByKey = new Map(programs.map((p) => [p.key, p]));
  const plans: Array<PlanView & { studentId: string; studentName: string }> = [];

  for (const student of students) {
    const studentId = userId(student);
    if (selectedStudentId && studentId !== selectedStudentId) continue;
    if (!selectedStudentId) continue;
    const enrollments = await enrollmentsRepo.listForStudent(studentId);
    for (const e of enrollments.filter((enrollment) => enrollment.status === "active")) {
      if (!e._id) continue;
      const program = programByKey.get(e.programKey);
      const s = await getOrCreateSchedule(auth, e._id);
      plans.push({ studentId, studentName: student.displayName, ...toPlanView(e._id, e.programKey, program?.title ?? e.programKey, s) });
    }
  }

  return { displayName: auth.displayName, students: students.map(publicUserOption), selectedStudentId, plans };
});

export const planMarkDay = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; programKey: string; programTitle: string; index: number; status: "off" | "sick" }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    await assertCanSeeStudent(auth, enrollment.studentId);
    const s = await setDayStatus(auth, data.enrollmentId, data.index, data.status);
    return toPlanView(data.enrollmentId, data.programKey, data.programTitle, s);
  });

export const planUnmarkDay = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; programKey: string; programTitle: string; index: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    await assertCanSeeStudent(auth, enrollment.studentId);
    const s = await clearDayStatus(auth, data.enrollmentId, data.index);
    return toPlanView(data.enrollmentId, data.programKey, data.programTitle, s);
  });

export const planWorkAhead = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; programKey: string; programTitle: string; count: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    await assertCanSeeStudent(auth, enrollment.studentId);
    const s = await workAheadDays(auth, data.enrollmentId, data.count);
    return toPlanView(data.enrollmentId, data.programKey, data.programTitle, s);
  });

export const planCompleteDay = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; programKey: string; programTitle: string; index: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (!enrollment) throw new Error("Enrollment not found");
    await assertCanSeeStudent(auth, enrollment.studentId);
    const s = await completeScheduleDay(auth, data.enrollmentId, data.index);
    return toPlanView(data.enrollmentId, data.programKey, data.programTitle, s);
  });
