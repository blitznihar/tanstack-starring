import { createServerFn } from "@tanstack/react-start";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { buildExam, startSession, getSessionView, applyEvent, submitExam, getResult, scoreWrittenForSession } from "~/server/exam/exam.js";
import { assertProgramUnlocked } from "~/server/billing/billing.js";
import { requireAuth } from "./context.js";

async function firstActiveEnrollment(studentId: string) {
  const enrollments = await enrollmentsRepo.listForStudent(studentId);
  return enrollments.find((e) => e.status === "active") ?? enrollments[0] ?? null;
}

/** Build a progressive/out-of-cycle/mock exam and start a session in one step. */
export const startExam = createServerFn({ method: "POST" })
  .validator((d: { kind?: "progressive" | "out_of_cycle" | "mock"; durationSeconds?: number; splitPct?: Record<string, number>; totalItems?: number; enrollmentId?: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    let enrollmentId = data.enrollmentId;
    if (!enrollmentId) {
      const enr = await firstActiveEnrollment(auth.userId);
      if (!enr?._id) throw new Error("No active enrollment");
      enrollmentId = enr._id;
    }
    // Gate by subscription/demo entitlement (§12) before building an exam.
    const enrollment = await enrollmentsRepo.findById(enrollmentId);
    if (enrollment) await assertProgramUnlocked(enrollment.programKey);
    const built = await buildExam(auth, {
      enrollmentId,
      kind: data.kind ?? "progressive",
      ...(data.durationSeconds ? { durationSeconds: data.durationSeconds } : {}),
      ...(data.splitPct ? { splitPct: data.splitPct } : {}),
      ...(data.totalItems ? { totalItems: data.totalItems } : {}),
    });
    const { sessionId } = await startSession(auth, built.examId);
    return { sessionId, coverage: built.coverage, itemCount: built.itemCount, earnUpTo: built.earnUpTo };
  });

export const examState = createServerFn({ method: "GET" })
  .validator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return getSessionView(auth, data.sessionId);
  });

export const examAction = createServerFn({ method: "POST" })
  .validator(
    (d: {
      sessionId: string;
      event:
        | { kind: "answer"; itemId: string; value: unknown }
        | { kind: "flag"; itemId: string }
        | { kind: "pause" }
        | { kind: "resume" }
        | { kind: "next" }
        | { kind: "prev" }
        | { kind: "goto"; index: number }
        | { kind: "endBreak" };
    }) => d,
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return applyEvent(auth, data.sessionId, data.event);
  });

export const examSubmit = createServerFn({ method: "POST" })
  .validator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return submitExam(auth, data.sessionId);
  });

export const examResult = createServerFn({ method: "GET" })
  .validator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return getResult(auth, data.sessionId);
  });

/** Advance async SCR/ECR scoring then return the merged result (polled by the results page). */
export const examScoreWritten = createServerFn({ method: "POST" })
  .validator((d: { sessionId: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return scoreWrittenForSession(auth, data.sessionId);
  });
