import { randomUUID } from "node:crypto";
import { clearReportDir, normalizeProgramKey, topicsBySubjectFromData, VALIDATION_PARENT_EMAIL, VALIDATION_PARENT_NAME, VALIDATION_STUDENT_EMAIL, VALIDATION_STUDENT_NAME, DEFAULT_PROGRAM_ARG, DEFAULT_TARGET_DAYS, todayInCentral, assertSafeMutation, planValidationCleanup, type CleanupPlan, type ValidationDataset } from "./validationCore.js";
import { buildSchedule } from "~/domain/scheduler/scheduler.js";
import { COLLECTIONS, closeDb, getCollection } from "~/repositories/db.js";
import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { lessonsRepo } from "~/repositories/lessons.js";
import { passagesRepo } from "~/repositories/passages.js";
import { programsRepo } from "~/repositories/programs.js";
import { schedulesRepo } from "~/repositories/schedules.js";
import { usersRepo } from "~/repositories/users.js";
import { hashPassword, DEFAULT_INITIAL_PASSWORD } from "~/server/auth/password.js";
import type { Enrollment } from "~/schemas/enrollment.js";
import type { User } from "~/schemas/user.js";

const VALIDATION_STUDENT_USERNAME = "validation-student-nihar-malali-r";
const VALIDATION_PARENT_USERNAME = "validation-parent-sushma-malali";

type SetupOptions = {
  studentEmail?: string;
  parentEmail?: string;
  parentName?: string;
  studentName?: string;
  programArg?: string;
  startDate?: string;
  days?: number;
  resetStudent?: boolean;
  dryRun?: boolean;
  force?: boolean;
};

type SetupResult = {
  dryRun: boolean;
  studentEmail: string;
  parentEmail: string;
  programKey: string;
  startDate: string;
  targetDays: number;
  studentUserId: string | null;
  parentUserId: string | null;
  enrollmentId: string | null;
  resetCollections: Record<string, number>;
  actions: string[];
};

export async function loadValidationDataset(programArg = DEFAULT_PROGRAM_ARG): Promise<ValidationDataset> {
  const programKey = normalizeProgramKey(programArg);
  const program = await programsRepo.findByKey(programKey);
  if (!program) throw new Error(`Program not found: ${programKey}. Run bun run seed or import the Grade 3 STAAR bundles first.`);
  const [standardsBySubject, lessonsBySubject, itemsBySubject, passagesBySubject] = await Promise.all([
    Promise.all(program.subjects.map((subject) => contentRepo.listStandards(program.key, subject))),
    Promise.all(program.subjects.map((subject) => lessonsRepo.list(program.key, subject))),
    Promise.all(program.subjects.map((subject) => contentRepo.listItems({ programKey: program.key, subject }))),
    Promise.all(program.subjects.map((subject) => passagesRepo.list(program.key, subject))),
  ]);
  return {
    program,
    standards: standardsBySubject.flat(),
    lessons: lessonsBySubject.flat(),
    items: itemsBySubject.flat(),
    passages: passagesBySubject.flat(),
  };
}

function validationUserSafety(user: (User & { _id?: string }) | null, markerUsername: string, role: "student" | "parent"): void {
  if (!user) return;
  if (!user.roles.includes(role)) throw new Error(`Existing ${role} email belongs to a non-${role} profile: ${user.email}`);
  if (role === "student" && user.username !== markerUsername) {
    throw new Error(
      `Refusing to reuse existing student email ${user.email} because username is ${user.username}, not ${markerUsername}. ` +
        "Use a validation-only student account or clean this up manually.",
    );
  }
}

async function findValidationUser(email: string, role: "student" | "parent", markerUsername: string): Promise<(User & { _id?: string }) | null> {
  const matches = await usersRepo.listByEmail(email.toLowerCase());
  return matches.find((user) => user.roles.includes(role) && (role === "parent" || user.username === markerUsername)) ?? null;
}

async function deleteByEnrollment(enrollmentId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const byEnrollment = [
    COLLECTIONS.lessonProgress,
    COLLECTIONS.practiceProgress,
    COLLECTIONS.responses,
    COLLECTIONS.itemUsage,
    COLLECTIONS.robuxLedger,
    COLLECTIONS.exams,
    COLLECTIONS.examSessions,
    COLLECTIONS.masteryStates,
    COLLECTIONS.schedules,
    COLLECTIONS.scoringJobs,
    COLLECTIONS.redemptions,
  ];
  for (const name of byEnrollment) {
    const deleted = await (await getCollection(name)).deleteMany({ enrollmentId });
    result[name] = deleted.deletedCount;
  }
  return result;
}

async function deleteEnrollmentRecord(enrollmentId: string): Promise<number> {
  const deleted = await (await getCollection<{ _id: string }>(COLLECTIONS.enrollments)).deleteOne({ _id: enrollmentId });
  return deleted.deletedCount;
}

async function deleteStudentNotifications(studentId: string): Promise<number> {
  const deleted = await (await getCollection(COLLECTIONS.notifications)).deleteMany({ userId: studentId });
  return deleted.deletedCount;
}

async function ensureValidationStudent(options: SetupOptions): Promise<SetupResult> {
  const studentEmail = (options.studentEmail ?? VALIDATION_STUDENT_EMAIL).toLowerCase();
  const parentEmail = (options.parentEmail ?? VALIDATION_PARENT_EMAIL).toLowerCase();
  const parentName = options.parentName ?? VALIDATION_PARENT_NAME;
  const studentName = options.studentName ?? VALIDATION_STUDENT_NAME;
  const programKey = normalizeProgramKey(options.programArg ?? DEFAULT_PROGRAM_ARG);
  const startDate = options.startDate ?? todayInCentral();
  const targetDays = options.days ?? DEFAULT_TARGET_DAYS;
  const dryRun = options.dryRun ?? false;
  const actions: string[] = [];
  const resetCollections: Record<string, number> = {};

  if (!dryRun) assertSafeMutation({ force: options.force, action: "create/reset validation student" });

  const dataset = await loadValidationDataset(programKey);
  const existingStudent = await findValidationUser(studentEmail, "student", VALIDATION_STUDENT_USERNAME);
  validationUserSafety(existingStudent, VALIDATION_STUDENT_USERNAME, "student");
  const existingParent = await findValidationUser(parentEmail, "parent", VALIDATION_PARENT_USERNAME);
  validationUserSafety(existingParent, VALIDATION_PARENT_USERNAME, "parent");

  let studentId = existingStudent?._id ? String(existingStudent._id) : null;
  let parentId = existingParent?._id ? String(existingParent._id) : null;

  if (!studentId) {
    actions.push(`Create validation student ${studentEmail}`);
    if (!dryRun) {
      const inserted = await usersRepo.insert({
        _id: randomUUID(),
        username: VALIDATION_STUDENT_USERNAME,
        displayName: studentName,
        email: studentEmail,
        emailConfirmed: true,
        roles: ["student"],
        studentIds: [],
        parentIds: [],
        passwordHash: await hashPassword(DEFAULT_INITIAL_PASSWORD),
        forceChangeOnFirstLogin: false,
        active: true,
      });
      studentId = String(inserted._id);
    }
  } else {
    actions.push(`Reuse validation student ${studentEmail} (${studentId})`);
  }

  if (!parentId) {
    actions.push(`Create validation parent ${parentEmail}`);
    if (!dryRun) {
      const inserted = await usersRepo.insert({
        _id: randomUUID(),
        username: VALIDATION_PARENT_USERNAME,
        displayName: parentName,
        email: parentEmail,
        emailConfirmed: true,
        roles: ["parent"],
        studentIds: studentId ? [studentId] : [],
        parentIds: [],
        passwordHash: await hashPassword(DEFAULT_INITIAL_PASSWORD),
        forceChangeOnFirstLogin: false,
        active: true,
      });
      parentId = String(inserted._id);
    }
  } else {
    actions.push(`Link existing validation parent ${parentEmail} (${parentId}) to the student`);
    if (!dryRun && studentId) {
      const parent = await usersRepo.findById(parentId);
      if (parent) {
        await usersRepo.update(parentId, { studentIds: [...new Set([...(parent.studentIds ?? []), studentId])] });
      }
    }
  }

  let enrollment: (Enrollment & { _id?: string }) | null = studentId ? await enrollmentsRepo.find(studentId, dataset.program.key) : null;
  if (enrollment?._id && options.resetStudent) {
    actions.push(`Reset existing enrollment ${enrollment._id}`);
    if (!dryRun) Object.assign(resetCollections, await deleteByEnrollment(String(enrollment._id)));
  }

  const enrollmentId = enrollment?._id ? String(enrollment._id) : randomUUID();
  actions.push(`${enrollment?._id ? "Upsert" : "Create"} enrollment ${enrollmentId} (${programKey}, ${startDate}, ${targetDays} days)`);
  if (!dryRun && studentId) {
    await enrollmentsRepo.upsert({
      _id: enrollmentId,
      studentId,
      programKey: dataset.program.key,
      startDate,
      targetDays,
      status: "active",
    });
    enrollment = await enrollmentsRepo.find(studentId, dataset.program.key);
    const topicsBySubject = topicsBySubjectFromData(dataset);
    await schedulesRepo.save(String(enrollment?._id ?? enrollmentId), buildSchedule({
      startDate,
      targetDays,
      subjects: dataset.program.subjects,
      topicsBySubject,
      quotaBySubject: dataset.program.key === "grade3_staar" ? { math: 2, rla: 1 } : undefined,
      lessonWeekdays: [1, 2, 3, 4],
      examWeekdays: [5, 6, 0],
      theta: 4,
      shortExamMinutes: 60,
      longExamMinutes: 180,
    }));
  }

  return {
    dryRun,
    studentEmail,
    parentEmail,
    programKey,
    startDate,
    targetDays,
    studentUserId: studentId,
    parentUserId: parentId,
    enrollmentId: String(enrollment?._id ?? enrollmentId),
    resetCollections,
    actions,
  };
}

export async function createOrResetValidationStudent(options: SetupOptions = {}): Promise<SetupResult> {
  try {
    return await ensureValidationStudent(options);
  } finally {
    await closeDb();
  }
}

export async function buildCleanupPlanFromDb(input: {
  studentEmail?: string;
  parentEmail?: string;
  programArg?: string;
  confirmEmail?: string;
  dryRun?: boolean;
  force?: boolean;
  deleteReports?: boolean;
}): Promise<CleanupPlan & { studentUserId: string | null; parentUserId: string | null; enrollmentId: string | null }> {
  const studentEmail = (input.studentEmail ?? VALIDATION_STUDENT_EMAIL).toLowerCase();
  const parentEmail = (input.parentEmail ?? VALIDATION_PARENT_EMAIL).toLowerCase();
  const programKey = normalizeProgramKey(input.programArg ?? DEFAULT_PROGRAM_ARG);
  const student = await findValidationUser(studentEmail, "student", VALIDATION_STUDENT_USERNAME);
  const parent = await findValidationUser(parentEmail, "parent", VALIDATION_PARENT_USERNAME);
  const enrollment = student?._id ? await enrollmentsRepo.find(String(student._id), programKey) : null;
  const plan = planValidationCleanup({
    ...input,
    studentEmail,
    parentEmail,
    programArg: programKey,
    studentUserId: student?._id ? String(student._id) : null,
    parentUserId: parent?._id ? String(parent._id) : null,
    enrollmentId: enrollment?._id ? String(enrollment._id) : null,
  });
  return {
    ...plan,
    studentUserId: student?._id ? String(student._id) : null,
    parentUserId: parent?._id ? String(parent._id) : null,
    enrollmentId: enrollment?._id ? String(enrollment._id) : null,
  };
}

export async function cleanupValidationStudent(input: {
  studentEmail?: string;
  parentEmail?: string;
  programArg?: string;
  confirmEmail?: string;
  dryRun?: boolean;
  force?: boolean;
  deleteReports?: boolean;
}): Promise<CleanupPlan & { executed: boolean; deleted: Record<string, number> }> {
  try {
    const plan = await buildCleanupPlanFromDb(input);
    const deleted: Record<string, number> = {};
    if (plan.dryRun || !plan.safeToExecute) return { ...plan, executed: false, deleted };
    assertSafeMutation({ force: input.force, action: "cleanup validation student" });

    if (plan.enrollmentId) {
      Object.assign(deleted, await deleteByEnrollment(plan.enrollmentId));
      deleted.enrollments = await deleteEnrollmentRecord(plan.enrollmentId);
    }
    if (plan.studentUserId) {
      deleted.notifications = await deleteStudentNotifications(plan.studentUserId);
      deleted.users = (await (await getCollection<{ _id: string; username: string; email: string }>(COLLECTIONS.users)).deleteOne({ _id: plan.studentUserId, username: VALIDATION_STUDENT_USERNAME, email: plan.studentEmail })).deletedCount;
    }
    if (plan.parentUserId && plan.studentUserId) {
      const parent = await usersRepo.findById(plan.parentUserId);
      if (parent) {
        await usersRepo.update(plan.parentUserId, {
          studentIds: (parent.studentIds ?? []).filter((id) => id !== plan.studentUserId),
        });
      }
    }
    if (input.deleteReports) await clearReportDir();
    return { ...plan, executed: true, deleted };
  } finally {
    await closeDb();
  }
}
