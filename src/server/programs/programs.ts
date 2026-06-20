import { randomUUID } from "node:crypto";
import { programSchema, type Program } from "~/schemas/program.js";
import { enrollmentSchema, type Enrollment } from "~/schemas/enrollment.js";
import { programsRepo } from "~/repositories/programs.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { requireCapability } from "~/server/auth/rbac.js";
import type { AuthContext } from "~/server/auth/session.js";

export async function listPrograms(): Promise<Program[]> {
  return programsRepo.list();
}

export async function getProgram(key: string): Promise<Program | null> {
  return programsRepo.findByKey(key);
}

/** Create/update a program (super_admin). Generalizes to any program — no grade hardcoding. */
export async function upsertProgram(actor: AuthContext, raw: unknown): Promise<Program> {
  requireCapability(actor.roles, "content.import");
  const program = programSchema.parse(raw);
  await programsRepo.upsert(program);
  return program;
}

/** Enroll a student in a program with its own schedule/target days. */
export async function enrollStudent(
  actor: AuthContext,
  raw: { studentId: string; programKey: string; startDate: string; targetDays?: number },
): Promise<Enrollment> {
  requireCapability(actor.roles, "users.manage");
  const program = await programsRepo.findByKey(raw.programKey);
  if (!program) throw new Error(`Unknown program: ${raw.programKey}`);
  const enrollment = enrollmentSchema.parse({
    _id: randomUUID(),
    studentId: raw.studentId,
    programKey: raw.programKey,
    startDate: raw.startDate,
    targetDays: raw.targetDays ?? program.targetDays,
    status: "active",
  });
  await enrollmentsRepo.upsert(enrollment);
  return enrollment;
}

export async function listEnrollments(studentId: string): Promise<Enrollment[]> {
  return enrollmentsRepo.listForStudent(studentId);
}
