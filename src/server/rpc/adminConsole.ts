import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { usersRepo } from "~/repositories/users.js";
import { toIso } from "~/lib/dates.js";
import { programSchema, type Program } from "~/schemas/program.js";
import { roleSchema } from "~/schemas/common.js";
import { requireCapability } from "~/server/auth/rbac.js";
import { listContentByProgram } from "~/server/content/browser.js";
import { importBundle, type ImportResult } from "~/server/content/import.js";
import { createUser, resetPassword, setPassword } from "~/server/auth/users.js";
import {
  allowedConsoleRoles,
  assertCanSeeStudent,
  canManageUser,
  isAdmin,
  isSuperAdmin,
  publicUserOption,
  roleFor,
  userId,
  visibleParentsFor,
  visibleStudentsFor,
  visibleUsersFor,
} from "~/server/users/associations.js";
import type { AuthContext } from "~/server/auth/session.js";
import { requireAuth } from "./context.js";

type ProgramStatus = Program["status"];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || `program_${Date.now()}`;
}

function defaultSplit(subjects: string[]): Record<string, number> {
  const base = Math.floor(100 / subjects.length);
  const out: Record<string, number> = {};
  subjects.forEach((subject, index) => {
    out[subject] = index === subjects.length - 1 ? 100 - base * (subjects.length - 1) : base;
  });
  return out;
}

function uniqueSubjects(values: unknown[], fallback = ["math"]): string[] {
  const subjects = [
    ...new Set(
      values
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return subjects.length ? subjects : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function normalizeExamBlueprint(source: Record<string, unknown>, subjects: string[]): Program["examBlueprint"] {
  const raw = asObject(source.examBlueprint);
  const durationPresets = uniqueNumbers(raw.durationPresets, [30, 40, 50, 60, 70, 80, 90, 105]);
  const defaultDurationMinutes = numberOr(raw.defaultDurationMinutes, 60);
  const defaultSplitPct = asObject(raw.defaultSplitPct);
  return {
    durationPresets,
    defaultDurationMinutes,
    defaultSplitPct: subjects.reduce<Record<string, number>>((acc, subject) => {
      const value = defaultSplitPct[subject];
      acc[subject] = typeof value === "number" ? value : defaultSplit(subjects)[subject] ?? 0;
      return acc;
    }, {}),
    breakSeconds: numberOr(raw.breakSeconds, 300),
  };
}

function uniqueNumbers(value: unknown, fallback: number[]): number[] {
  const parsed = asArray(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.round(entry));
  return [...new Set(parsed.length ? parsed : fallback)].sort((a, b) => a - b);
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function normalizeProgramUpload(raw: unknown): { program: Program; bundles: unknown[] } {
  const payload = asObject(raw);
  const metadata = asObject(payload.metadata);
  const programSource = asObject(payload.program);
  const source = Object.keys(programSource).length ? programSource : payload;
  const bundleCandidates = [
    ...asArray(payload.bundles),
    ...asArray(payload.contentBundles),
    ...asArray(payload.contents),
    ...asArray(payload.content),
    ...asArray(payload.bundle),
  ].filter((entry) => entry && typeof entry === "object");
  const directBundle = payload.items ? [payload] : [];
  const rawSubjects = asArray(source.subjects ?? metadata.subjects);
  const subjects = uniqueSubjects(rawSubjects.length ? rawSubjects : bundleCandidates.map((bundle) => asObject(bundle).subject));
  const title = String(source.title ?? source.name ?? source.programName ?? metadata.title ?? metadata.name ?? "Uploaded Program").trim();
  const key = slugify(String(source.key ?? metadata.key ?? title));
  const program = programSchema.parse({
    key,
    title,
    category: String(source.category ?? metadata.category ?? "K-12").trim() || "K-12",
    subjects,
    targetDays: numberOr(source.targetDays ?? metadata.targetDays, 45),
    examBlueprint: normalizeExamBlueprint(source, subjects),
    scoringModel: source.scoringModel,
    conceptConfig: source.conceptConfig,
    robuxRules: source.robuxRules,
    status: source.status ?? "setup",
  });
  const bundles = (bundleCandidates.length ? bundleCandidates : directBundle).map((bundle, index) => ({
    ...asObject(bundle),
    programKey: asObject(bundle).programKey ?? program.key,
    subject: asObject(bundle).subject ?? subjects[0] ?? "math",
    version: asObject(bundle).version ?? index + 1,
    status: asObject(bundle).status ?? "available",
    title: asObject(bundle).title ?? `${program.title} Content ${index + 1}`,
  }));
  return { program, bundles };
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).map(String).map((id) => id.trim()).filter(Boolean))];
}

function assertRoleAllowed(auth: AuthContext, role: z.infer<typeof roleSchema>): void {
  if (!allowedConsoleRoles(auth).includes(role)) {
    throw new Error(`This account cannot create or assign the ${role.replace(/_/g, " ")} role.`);
  }
}

function assertIdsVisible(ids: string[], visibleIds: Set<string>, label: string): void {
  const missing = ids.filter((id) => !visibleIds.has(id));
  if (missing.length) throw new Error(`One or more selected ${label} are not associated with this account.`);
}

async function normalizeAssociations(
  auth: AuthContext,
  role: z.infer<typeof roleSchema>,
  input: { studentIds?: string[]; parentIds?: string[]; adminIds?: string[] },
): Promise<{ studentIds: string[]; parentIds: string[]; adminIds: string[]; linkParentIds: string[] }> {
  const [visibleStudents, visibleParents] = await Promise.all([visibleStudentsFor(auth), visibleParentsFor(auth)]);
  const visibleStudentIds = new Set(visibleStudents.map(userId));
  const visibleParentIds = new Set(visibleParents.map(userId));
  const studentIds = uniqueIds(input.studentIds);
  const parentIds = uniqueIds(input.parentIds);
  const adminIds = uniqueIds(input.adminIds);

  if (role === "parent") {
    if (studentIds.length === 0 && visibleStudents.length > 0) throw new Error("A parent must be associated with at least one student.");
    assertIdsVisible(studentIds, visibleStudentIds, "students");
    return { studentIds, parentIds: [], adminIds, linkParentIds: [] };
  }

  if (role === "admin") {
    assertIdsVisible(parentIds, visibleParentIds, "parents");
    return { studentIds: [], parentIds, adminIds: [], linkParentIds: [] };
  }

  if (role === "student") {
    if (parentIds.length === 0 && visibleParents.length > 0) throw new Error("A student must be associated with at least one parent.");
    assertIdsVisible(parentIds, visibleParentIds, "parents");
    return { studentIds: [], parentIds: [], adminIds: [], linkParentIds: parentIds };
  }

  return { studentIds: [], parentIds: [], adminIds: [], linkParentIds: [] };
}

async function linkStudentToParents(studentId: string, parentIds: string[]): Promise<void> {
  await Promise.all(
    parentIds.map(async (parentId) => {
      const parent = await usersRepo.findById(parentId);
      if (!parent) return;
      await usersRepo.update(parentId, { studentIds: [...new Set([...(parent.studentIds ?? []), studentId])] });
    }),
  );
}

async function linkParentToAdmin(adminId: string, parentId: string): Promise<void> {
  const admin = await usersRepo.findById(adminId);
  if (!admin) return;
  await usersRepo.update(adminId, { parentIds: [...new Set([...(admin.parentIds ?? []), parentId])] });
}

async function setParentAdmins(parentId: string, adminIds: string[]): Promise<void> {
  const users = await usersRepo.list();
  const admins = users.filter((user) => user.roles.includes("admin") && user._id);
  const selected = new Set(adminIds);
  const validAdminIds = new Set(admins.map(userId));
  assertIdsVisible(adminIds, validAdminIds, "admins");
  await Promise.all(
    admins.map(async (admin) => {
      const adminId = userId(admin);
      const current = new Set(admin.parentIds ?? []);
      const shouldHave = selected.has(adminId);
      if (shouldHave) current.add(parentId);
      else current.delete(parentId);
      await usersRepo.update(adminId, { parentIds: [...current] });
    }),
  );
}

async function linkStudentToAdmin(adminId: string, studentId: string): Promise<void> {
  const admin = await usersRepo.findById(adminId);
  if (!admin) return;
  await usersRepo.update(adminId, { studentIds: [...new Set([...(admin.studentIds ?? []), studentId])] });
}

async function buildConsoleSnapshot(auth: AuthContext) {
  requireCapability(auth.roles, "reports.viewAll");

  const allUsers = await usersRepo.list();
  const [users, visibleStudents, visibleParents, programs, content] = await Promise.all([
    visibleUsersFor(auth, allUsers),
    visibleStudentsFor(auth, allUsers),
    visibleParentsFor(auth, allUsers),
    programsRepo.list(),
    listContentByProgram(auth),
  ]);

  const studentIds = users.filter((u) => u.roles.includes("student") && u._id).map((u) => String(u._id));
  const enrollments = (await Promise.all(studentIds.map((studentId) => enrollmentsRepo.listForStudent(studentId)))).flat();
  const enrollmentsByStudent = new Map<string, typeof enrollments>();
  const activeByProgram = new Map<string, number>();

  for (const enrollment of enrollments) {
    const studentId = String(enrollment.studentId);
    const existing = enrollmentsByStudent.get(studentId) ?? [];
    existing.push(enrollment);
    enrollmentsByStudent.set(studentId, existing);
    if (enrollment.status === "active") {
      activeByProgram.set(enrollment.programKey, (activeByProgram.get(enrollment.programKey) ?? 0) + 1);
    }
  }

  const contentByProgram = new Map(content.map((c) => [c.programKey, c]));
  const adminOptions = allUsers.filter((user) => user.active && user.roles.includes("admin")).map(publicUserOption);
  const adminIdsByParent = new Map<string, string[]>();
  for (const admin of allUsers.filter((user) => user.roles.includes("admin"))) {
    const adminId = userId(admin);
    for (const parentId of admin.parentIds ?? []) {
      adminIdsByParent.set(parentId, [...(adminIdsByParent.get(parentId) ?? []), adminId]);
    }
  }
  const parentIdsByStudent = new Map<string, string[]>();
  for (const parent of allUsers.filter((user) => user.roles.includes("parent"))) {
    const parentId = userId(parent);
    for (const studentId of parent.studentIds ?? []) {
      parentIdsByStudent.set(studentId, [...(parentIdsByStudent.get(studentId) ?? []), parentId]);
    }
  }

  return {
    viewer: {
      userId: auth.userId,
      roles: auth.roles,
      isAdmin: isAdmin(auth),
      isSuperAdmin: isSuperAdmin(auth),
      allowedRoles: allowedConsoleRoles(auth),
      canManagePrograms: isSuperAdmin(auth),
      canManageContent: isSuperAdmin(auth),
    },
    associationOptions: {
      students: visibleStudents.map(publicUserOption),
      parents: visibleParents.map(publicUserOption),
      admins: isSuperAdmin(auth) ? adminOptions : [],
    },
    users: await Promise.all(users.map(async (u) => {
      const id = u._id ? String(u._id) : u.username;
      const manageable = await canManageUser(auth, u);
      return {
        id,
        username: u.username,
        displayName: u.displayName,
        email: u.email ?? "blitznihar@gmail.com",
        emailConfirmed: !!u.emailConfirmed,
        roles: u.roles,
        primaryRole: roleFor(u.roles),
        studentIds: u.studentIds ?? [],
        parentIds: u.roles.includes("student") ? parentIdsByStudent.get(id) ?? [] : u.parentIds ?? [],
        adminIds: u.roles.includes("parent") ? adminIdsByParent.get(id) ?? [] : [],
        active: u.active,
        forceChangeOnFirstLogin: u.forceChangeOnFirstLogin,
        createdAt: toIso(u.createdAt),
        canManage: manageable,
        canDelete: manageable && auth.userId !== id,
        enrollments: (enrollmentsByStudent.get(id) ?? []).map((e) => ({
          id: e._id ? String(e._id) : `${id}:${e.programKey}`,
          programKey: e.programKey,
          status: e.status,
          startDate: e.startDate,
          targetDays: e.targetDays,
        })),
      };
    })),
    programs: programs.map((p) => {
      const programContent = contentByProgram.get(p.key);
      const bundles = programContent?.bundles ?? [];
      return {
        key: p.key,
        title: p.title,
        category: p.category,
        status: p.status,
        subjects: p.subjects,
        targetDays: p.targetDays,
        enrolledCount: activeByProgram.get(p.key) ?? 0,
        bundleCount: bundles.length,
        itemCount: bundles.reduce((sum, b) => sum + b.itemCount, 0),
        lessonCount: programContent?.lessonCount ?? 0,
        lessons: programContent?.lessons ?? [],
        bundles: bundles.map((b) => ({ ...b, bundleId: String(b.bundleId) })),
        examBlueprint: p.examBlueprint,
      };
    }),
    enrollmentCount: enrollments.filter((e) => e.status === "active").length,
  };
}

async function snapshotForCurrentUser() {
  const auth = await requireAuth();
  return buildConsoleSnapshot(auth);
}

export const consoleSnapshot = createServerFn({ method: "GET" }).handler(snapshotForCurrentUser);

const userRolesInput = z.array(roleSchema).length(1);
const createConsoleUserInput = z.object({
  username: z.string().min(3).max(64),
  displayName: z.string().min(1),
  email: z.string().email().default("blitznihar@gmail.com"),
  roles: userRolesInput,
  studentIds: z.array(z.string()).default([]),
  parentIds: z.array(z.string()).default([]),
  adminIds: z.array(z.string()).default([]),
  password: z.string().min(8).optional(),
  forceChangeOnFirstLogin: z.boolean().default(true),
});

export const createConsoleUser = createServerFn({ method: "POST" })
  .validator((d: unknown) => createConsoleUserInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const role = data.roles[0]!;
    assertRoleAllowed(auth, role);
    const associations = await normalizeAssociations(auth, role, data);
    const created = await createUser(auth, {
      username: data.username.trim(),
      displayName: data.displayName.trim(),
      email: data.email.trim().toLowerCase(),
      roles: [role],
      studentIds: associations.studentIds,
      parentIds: associations.parentIds,
      password: data.password?.trim() || undefined,
      forceChangeOnFirstLogin: data.forceChangeOnFirstLogin,
    });
    const createdId = created.user._id ? String(created.user._id) : created.user.username;
    if (role === "student") {
      await linkStudentToParents(createdId, associations.linkParentIds);
      if (isAdmin(auth) && !isSuperAdmin(auth) && associations.linkParentIds.length === 0) await linkStudentToAdmin(auth.userId, createdId);
    }
    if (role === "parent" && isAdmin(auth) && !isSuperAdmin(auth)) await linkParentToAdmin(auth.userId, createdId);
    if (role === "parent" && isSuperAdmin(auth)) await setParentAdmins(createdId, associations.adminIds);
    return { snapshot: await buildConsoleSnapshot(auth), generatedPassword: created.generatedPassword };
  });

const updateConsoleUserInput = z.object({
  id: z.string().min(1),
  username: z.string().min(3).max(64),
  displayName: z.string().min(1),
  email: z.string().email(),
  roles: userRolesInput,
  studentIds: z.array(z.string()).default([]),
  parentIds: z.array(z.string()).default([]),
  adminIds: z.array(z.string()).default([]),
  active: z.boolean(),
  forceChangeOnFirstLogin: z.boolean().optional(),
});

export const updateConsoleUser = createServerFn({ method: "POST" })
  .validator((d: unknown) => updateConsoleUserInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "users.manage");
    const existing = await usersRepo.findById(data.id);
    if (!existing) throw new Error("User not found");
    if (!(await canManageUser(auth, existing))) throw new Error("Forbidden: user is not associated with this account.");
    const role = data.roles[0]!;
    assertRoleAllowed(auth, role);
    const associations = await normalizeAssociations(auth, role, data);
    const matchingUsername = await usersRepo.findByUsername(data.username);
    if (matchingUsername?._id && String(matchingUsername._id) !== data.id) {
      throw new Error(`Username already exists: ${data.username}`);
    }
    await usersRepo.update(data.id, {
      username: data.username.trim(),
      displayName: data.displayName.trim(),
      email: data.email.trim().toLowerCase(),
      emailConfirmed: existing.email?.toLowerCase() === data.email.trim().toLowerCase() ? !!existing.emailConfirmed : false,
      roles: [role],
      studentIds: associations.studentIds,
      parentIds: associations.parentIds,
      active: auth.userId === data.id ? true : data.active,
      ...(data.forceChangeOnFirstLogin == null ? {} : { forceChangeOnFirstLogin: data.forceChangeOnFirstLogin }),
    });
    if (role === "student") {
      await linkStudentToParents(data.id, associations.linkParentIds);
      if (isAdmin(auth) && !isSuperAdmin(auth) && associations.linkParentIds.length === 0) await linkStudentToAdmin(auth.userId, data.id);
    }
    if (role === "parent" && isAdmin(auth) && !isSuperAdmin(auth)) await linkParentToAdmin(auth.userId, data.id);
    if (role === "parent" && isSuperAdmin(auth)) await setParentAdmins(data.id, associations.adminIds);
    return buildConsoleSnapshot(auth);
  });

export const deleteConsoleUser = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "users.manage");
    if (auth.userId === data.id) throw new Error("You cannot remove the signed-in user.");
    const existing = await usersRepo.findById(data.id);
    if (!existing) throw new Error("User not found");
    if (!(await canManageUser(auth, existing))) throw new Error("Forbidden: user is not associated with this account.");
    await usersRepo.delete(data.id);
    return buildConsoleSnapshot(auth);
  });

export const resetConsoleUserPassword = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "users.manage");
    const existing = await usersRepo.findById(data.id);
    if (!existing) throw new Error("User not found");
    if (!(await canManageUser(auth, existing))) throw new Error("Forbidden: user is not associated with this account.");
    const generatedPassword = await resetPassword(auth, data.id, true);
    return { snapshot: await buildConsoleSnapshot(auth), generatedPassword };
  });

export const setConsoleUserPassword = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1), password: z.string().min(8), forceChangeOnFirstLogin: z.boolean().default(false) }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "users.manage");
    const existing = await usersRepo.findById(data.id);
    if (!existing) throw new Error("User not found");
    if (!(await canManageUser(auth, existing))) throw new Error("Forbidden: user is not associated with this account.");
    await setPassword(auth, data.id, data.password, data.forceChangeOnFirstLogin);
    return buildConsoleSnapshot(auth);
  });

const addProgramInput = z.object({
  title: z.string().min(2).max(80),
  key: z.string().optional(),
  category: z.string().min(1).default("K-12"),
  subjects: z.array(z.string().min(1)).min(1),
  targetDays: z.number().int().positive().default(45),
});

export const addProgram = createServerFn({ method: "POST" })
  .validator((d: unknown) => addProgramInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "content.import");
    const subjects = [...new Set(data.subjects.map((s) => s.trim().toLowerCase()).filter(Boolean))];
    const key = slugify(data.key?.trim() || data.title);
    const program = programSchema.parse({
      key,
      title: data.title.trim(),
      category: data.category.trim(),
      subjects,
      targetDays: data.targetDays,
      examBlueprint: {
        durationPresets: [30, 40, 50, 60, 70, 80, 90, 105, 120, 150, 180],
        defaultDurationMinutes: 60,
        defaultSplitPct: defaultSplit(subjects),
        breakSeconds: 300,
      },
      status: "setup",
    });
    await programsRepo.upsert(program);
    return buildConsoleSnapshot(auth);
  });

export const uploadProgramJson = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ json: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "content.import");
    const parsed = JSON.parse(data.json) as unknown;
    const { program, bundles } = normalizeProgramUpload(parsed);
    await programsRepo.upsert(program);
    const imported: ImportResult[] = [];
    for (const bundle of bundles) imported.push(await importBundle(auth, bundle));
    return {
      snapshot: await buildConsoleSnapshot(auth),
      imported: {
        programKey: program.key,
        programTitle: program.title,
        bundleCount: imported.length,
        itemCount: imported.reduce((sum, result) => sum + result.itemCount, 0),
      },
    };
  });

const setProgramStatusInput = z.object({
  programKey: z.string().min(1),
  status: z.enum(["live", "setup", "soon", "archived"]),
});

export const setProgramStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) => setProgramStatusInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "content.import");
    await programsRepo.setStatus(data.programKey, data.status as ProgramStatus);
    return buildConsoleSnapshot(auth);
  });

const setStudentProgramInput = z.object({
  studentId: z.string().min(1),
  programKey: z.string().min(1),
  active: z.boolean(),
});

export const setStudentProgram = createServerFn({ method: "POST" })
  .validator((d: unknown) => setStudentProgramInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    requireCapability(auth.roles, "reports.viewAll");
    await assertCanSeeStudent(auth, data.studentId);
    const program = await programsRepo.findByKey(data.programKey);
    if (!program) throw new Error(`Unknown program: ${data.programKey}`);
    const existing = await enrollmentsRepo.find(data.studentId, data.programKey);
    if (data.active) {
      if (existing?._id) {
        await enrollmentsRepo.setStatusForStudentProgram(data.studentId, data.programKey, "active");
      } else {
        await enrollmentsRepo.upsert({
          _id: randomUUID(),
          studentId: data.studentId,
          programKey: data.programKey,
          startDate: new Date().toISOString().slice(0, 10),
          targetDays: program.targetDays,
          status: "active",
        });
      }
    } else if (existing?._id) {
      await enrollmentsRepo.setStatusForStudentProgram(data.studentId, data.programKey, "archived");
    }
    return buildConsoleSnapshot(auth);
  });
