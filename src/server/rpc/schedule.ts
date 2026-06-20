import { createServerFn } from "@tanstack/react-start";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { getOrCreateSchedule, setDayStatus, workAheadDays, completeScheduleDay } from "~/server/scheduler/scheduler.js";
import { accountUnlockedPrograms } from "~/server/billing/billing.js";
import { requireCapability } from "~/server/auth/rbac.js";
import { assertCanSeeStudent, publicUserOption, userId, visibleStudentsFor } from "~/server/users/associations.js";
import { requireAuth } from "./context.js";

type PlanView = {
  enrollmentId: string;
  programKey: string;
  programTitle: string;
  targetDays: number;
  streak: number;
  currentDay: number;
  days: {
    index: number;
    date: string;
    status: string;
    tag: string;
    title: string;
    subject: string;
    bumped: boolean;
    workloadFactor: number;
    isExam: boolean;
  }[];
};

function toPlanView(enrollmentId: string, programKey: string, programTitle: string, s: Awaited<ReturnType<typeof getOrCreateSchedule>>): PlanView {
  return {
    enrollmentId,
    programKey,
    programTitle,
    targetDays: s.schedule.targetDays,
    streak: s.streak,
    currentDay: s.currentDay,
    days: s.schedule.days.map((d) => {
      const exam = d.tasks.some((t) => t.kind === "exam");
      const subjects = [...new Set(d.tasks.filter((t) => t.subject).map((t) => t.subject!))];
      return {
        index: d.index,
        date: d.date,
        status: d.status,
        tag: exam ? "EXAM" : d.status === "off" ? "OFF" : d.status === "sick" ? "SICK" : d.tasks.length > d.baseCount ? "ADDED" : "LESSON",
        title: exam ? "Progressive exam" : d.tasks[0]?.topic ?? (d.status === "off" ? "Day off" : d.status === "sick" ? "Sick day" : "Catch-up / review"),
        subject: subjects.join(" + "),
        bumped: d.workloadFactor > 1,
        workloadFactor: d.workloadFactor,
        isExam: exam,
      };
    }),
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
