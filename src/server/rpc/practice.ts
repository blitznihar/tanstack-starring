import { createServerFn } from "@tanstack/react-start";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { completePracticeSet, getPracticeSet, submitPracticeAnswer } from "~/server/practice/practice.js";
import { walletFor } from "~/server/gamification/wallet.js";
import { isProgramUnlocked, assertProgramUnlocked } from "~/server/billing/billing.js";
import { requireAuth } from "./context.js";

/** Resolve the signed-in student's active enrollment that offers `subject`. */
export async function resolvePracticeEnrollment(studentId: string, subject: string) {
  const enrollments = await enrollmentsRepo.listForStudent(studentId);
  for (const e of enrollments) {
    if (e.status !== "active") continue;
    const program = await programsRepo.findByKey(e.programKey);
    if (program?.subjects.includes(subject)) return e;
  }
  return null;
}

/** Today's practice set for the signed-in student (default subject: math). */
export const myPracticeSet = createServerFn({ method: "GET" })
  .validator((d?: { subject?: string; standardCode?: string }) => ({ subject: d?.subject ?? "math", standardCode: d?.standardCode }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await resolvePracticeEnrollment(auth.userId, data.subject);
    // Gate by subscription/demo entitlement (§12): a locked program serves no content.
    if (!enrollment?._id || !(await isProgramUnlocked(enrollment.programKey))) {
      return { available: false as const, displayName: auth.displayName };
    }
    const [set, wallet] = await Promise.all([
      getPracticeSet(auth, { enrollmentId: enrollment._id, subject: data.subject, standardCode: data.standardCode }),
      walletFor(enrollment._id),
    ]);
    return {
      available: true as const,
      displayName: auth.displayName,
      enrollmentId: enrollment._id,
      programKey: enrollment.programKey,
      set,
      wallet: { available: wallet.available, lifetime: wallet.lifetimeEarned },
    };
  });

/** Submit (check) one practice answer — returns feedback + Robux award. */
export const submitPractice = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; itemId: string; selected: unknown }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (enrollment) await assertProgramUnlocked(enrollment.programKey);
    return submitPracticeAnswer(auth, data);
  });

/** Submit the whole visible practice set and send one progress report. */
export const completePractice = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; subject: string; itemIds: string[]; standardCode?: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const enrollment = await enrollmentsRepo.findById(data.enrollmentId);
    if (enrollment) await assertProgramUnlocked(enrollment.programKey);
    return completePracticeSet(auth, data);
  });
