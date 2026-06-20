import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { contentRepo } from "~/repositories/content.js";
import { schedulesRepo } from "~/repositories/schedules.js";
import { buildSchedule, markDay, workAhead, completeDay, computeStreak, currentDayIndex, type Schedule } from "~/domain/scheduler/scheduler.js";
import type { AuthContext } from "~/server/auth/session.js";

function assertOwner(actor: AuthContext, enrollment: { studentId: string } | null): void {
  if (!enrollment) throw new Error("Enrollment not found");
  const isOwner = actor.userId === enrollment.studentId;
  const isPrivileged = actor.roles.some((r) => r === "admin" || r === "super_admin" || r === "parent");
  if (!isOwner && !isPrivileged) throw new Error("Forbidden: not your enrollment");
}

async function programTopics(programKey: string): Promise<string[]> {
  const items = await contentRepo.listItems({ programKey });
  const seen: string[] = [];
  for (const it of items) for (const c of it.standardCodes) if (!seen.includes(c)) seen.push(c);
  return seen;
}

/** Load the enrollment's schedule, building one from program config on first access. */
export async function getOrCreateSchedule(actor: AuthContext, enrollmentId: string): Promise<{ schedule: Schedule; streak: number; currentDay: number }> {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  assertOwner(actor, enrollment);
  let doc = await schedulesRepo.find(enrollmentId);
  if (!doc) {
    const program = await programsRepo.findByKey(enrollment!.programKey);
    const schedule = buildSchedule({
      startDate: enrollment!.startDate,
      targetDays: enrollment!.targetDays,
      subjects: program?.subjects ?? ["math"],
      topics: await programTopics(enrollment!.programKey),
    });
    await schedulesRepo.save(enrollmentId, schedule);
    doc = { ...schedule, _id: enrollmentId, enrollmentId, updatedAt: new Date() };
  }
  const schedule: Schedule = { startDate: doc.startDate, targetDays: doc.targetDays, days: doc.days };
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
    ? { startDate: doc.startDate, targetDays: doc.targetDays, days: doc.days }
    : (await getOrCreateSchedule(actor, enrollmentId)).schedule;
  const next = fn(current);
  await schedulesRepo.save(enrollmentId, next);
  const cur = currentDayIndex(next);
  return { schedule: next, streak: computeStreak(next, cur - 1), currentDay: cur };
}

export const setDayStatus = (actor: AuthContext, enrollmentId: string, index: number, status: "off" | "sick") =>
  mutate(actor, enrollmentId, (s) => markDay(s, index, status));

export const completeScheduleDay = (actor: AuthContext, enrollmentId: string, index: number) =>
  mutate(actor, enrollmentId, (s) => completeDay(s, index));

export const workAheadDays = (actor: AuthContext, enrollmentId: string, count: number) =>
  mutate(actor, enrollmentId, (s) => workAhead(s, count).schedule);
