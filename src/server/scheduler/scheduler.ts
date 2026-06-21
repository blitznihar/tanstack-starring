import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { contentRepo } from "~/repositories/content.js";
import { schedulesRepo } from "~/repositories/schedules.js";
import { buildSchedule, markDay, unmarkDay, workAhead, completeDay, computeStreak, currentDayIndex, type Schedule } from "~/domain/scheduler/scheduler.js";
import type { AuthContext } from "~/server/auth/session.js";

function assertOwner(actor: AuthContext, enrollment: { studentId: string } | null): void {
  if (!enrollment) throw new Error("Enrollment not found");
  const isOwner = actor.userId === enrollment.studentId;
  const isPrivileged = actor.roles.some((r) => r === "admin" || r === "super_admin" || r === "parent");
  if (!isOwner && !isPrivileged) throw new Error("Forbidden: not your enrollment");
}

async function programTopicsBySubject(programKey: string, subjects: string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const subject of subjects) {
    const standards = await contentRepo.listStandards(programKey, subject);
    const fromStandards = standards.map((standard) => standard.code).filter(Boolean);
    if (fromStandards.length > 0) {
      out[subject] = [...new Set(fromStandards)];
      continue;
    }
    const items = await contentRepo.listItems({ programKey, subject });
    const seen: string[] = [];
    for (const item of items) for (const code of item.standardCodes) if (!seen.includes(code)) seen.push(code);
    out[subject] = seen;
  }
  return out;
}

function hasExam(day: Schedule["days"][number]): boolean {
  return day.tasks.some((task) => task.kind === "exam");
}

function hasLessonWork(day: Schedule["days"][number]): boolean {
  return day.status === "scheduled" && day.tasks.some((task) => task.kind === "lesson");
}

function needsPolicyRefresh(schedule: Schedule): boolean {
  if (!schedule.config) return true;
  if (schedule.days.some((day) => day.status !== "off" && day.status !== "sick" && !day.programDayEnd)) return true;
  for (const day of schedule.days) {
    if (hasExam(day)) {
      const exam = day.tasks.find((task) => task.kind === "exam");
      if (!exam?.durationMinutes) return true;
    }
    if (hasExam(day) && hasLessonWork(day)) return true;
  }
  return false;
}

async function buildEnrollmentSchedule(enrollment: NonNullable<Awaited<ReturnType<typeof enrollmentsRepo.findById>>>): Promise<Schedule> {
  const program = await programsRepo.findByKey(enrollment.programKey);
  const subjects = program?.subjects ?? ["math"];
  return buildSchedule({
    startDate: enrollment.startDate,
    targetDays: enrollment.targetDays,
    subjects,
    topicsBySubject: await programTopicsBySubject(enrollment.programKey, subjects),
  });
}

function asSchedule(doc: NonNullable<Awaited<ReturnType<typeof schedulesRepo.find>>>): Schedule {
  return {
    startDate: doc.startDate,
    targetDays: doc.targetDays,
    days: doc.days,
    config: doc.config,
    dayStatus: doc.dayStatus,
    doneDates: doc.doneDates,
  };
}

/** Load the enrollment's schedule, building one from program config on first access. */
export async function getOrCreateSchedule(actor: AuthContext, enrollmentId: string): Promise<{ schedule: Schedule; streak: number; currentDay: number }> {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  assertOwner(actor, enrollment);
  let doc = await schedulesRepo.find(enrollmentId);
  if (!doc) {
    const schedule = await buildEnrollmentSchedule(enrollment!);
    await schedulesRepo.save(enrollmentId, schedule);
    doc = { ...schedule, _id: enrollmentId, enrollmentId, updatedAt: new Date() };
  }
  let schedule: Schedule = asSchedule(doc);
  if (needsPolicyRefresh(schedule)) {
    schedule = await buildEnrollmentSchedule(enrollment!);
    await schedulesRepo.save(enrollmentId, schedule);
  }
  const current = currentDayIndex(schedule);
  // Streak is measured up to the day before "next to do" — future scheduled days
  // are not misses.
  return { schedule, streak: computeStreak(schedule, current - 1), currentDay: current };
}

async function mutate(actor: AuthContext, enrollmentId: string, fn: (s: Schedule) => Schedule) {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  assertOwner(actor, enrollment);
  const doc = await schedulesRepo.find(enrollmentId);
  const current: Schedule = doc
    ? asSchedule(doc)
    : (await getOrCreateSchedule(actor, enrollmentId)).schedule;
  const next = fn(current);
  await schedulesRepo.save(enrollmentId, next);
  const cur = currentDayIndex(next);
  return { schedule: next, streak: computeStreak(next, cur - 1), currentDay: cur };
}

export const setDayStatus = (actor: AuthContext, enrollmentId: string, index: number, status: "off" | "sick") =>
  mutate(actor, enrollmentId, (s) => markDay(s, index, status));

export const clearDayStatus = (actor: AuthContext, enrollmentId: string, index: number) =>
  mutate(actor, enrollmentId, (s) => unmarkDay(s, index));

export const completeScheduleDay = (actor: AuthContext, enrollmentId: string, index: number) =>
  mutate(actor, enrollmentId, (s) => completeDay(s, index));

export const workAheadDays = (actor: AuthContext, enrollmentId: string, count: number) =>
  mutate(actor, enrollmentId, (s) => workAhead(s, count).schedule);
