import { profileRepo } from "~/repositories/profile.js";
import { usersRepo } from "~/repositories/users.js";
import { requireCapability } from "~/server/auth/rbac.js";
import { profileExportSchema, PROFILE_SCHEMA_VERSION, type ProfileExport } from "~/schemas/profileExport.js";
import { decideProfileImport, type ImportDecision } from "~/domain/profile/lww.js";
import type { AuthContext } from "~/server/auth/session.js";

/**
 * Profile export/import (§13). Whole student across all enrollments; content
 * excluded; import is last-write-wins by `exportedAt` with a confirm/preview.
 */

type Doc = Record<string, unknown>;

const COUNT_KEYS = [
  "enrollments",
  "responses",
  "examSessions",
  "exams",
  "itemUsage",
  "masteryStates",
  "robuxLedger",
  "redemptions",
  "rewardRules",
  "schedules",
  "scoringJobs",
] as const;

/** ISO datetime keys we revive back to Date on import (NOT YYYY-MM-DD strings). */
const DATE_KEYS = new Set(["createdAt", "updatedAt", "at", "usedAt", "scoredAt"]);
const ISO_DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => reviveDates(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DATE_KEYS.has(k) && typeof v === "string" && ISO_DT.test(v)) out[k] = new Date(v);
      else out[k] = reviveDates(v);
    }
    return out as unknown as T;
  }
  return value;
}

async function resolveStudentId(studentId?: string): Promise<string> {
  if (studentId) return studentId;
  const student = await usersRepo.findByRole("student");
  if (!student?._id) throw new Error("No student to export");
  return String(student._id);
}

export async function exportProfile(actor: AuthContext, studentId?: string): Promise<ProfileExport> {
  requireCapability(actor.roles, "profile.export");
  const id = await resolveStudentId(studentId);
  const bundle = await profileRepo.exportStudent(id);
  if (!bundle.user) throw new Error("Student not found");

  // Strip credentials + the LWW marker from the exported user (§13).
  const { passwordHash: _drop, profileExportedAt: _m, ...user } = bundle.user;

  const payload: ProfileExport = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    studentId: id,
    programKeys: bundle.programKeys,
    user,
    enrollments: bundle.enrollments,
    responses: bundle.responses,
    examSessions: bundle.examSessions,
    exams: bundle.exams,
    itemUsage: bundle.itemUsage,
    masteryStates: bundle.masteryStates,
    robuxLedger: bundle.robuxLedger,
    redemptions: bundle.redemptions,
    rewardRules: bundle.rewardRules,
    schedules: bundle.schedules,
    scoringJobs: bundle.scoringJobs,
  };
  // Validate our own output so a malformed export never leaves the building.
  return profileExportSchema.parse(payload);
}

export type ImportPreview = {
  ok: boolean;
  decision: ImportDecision;
  studentId: string;
  counts: Record<string, number>;
  schemaVersion: number;
  error?: string;
};

function counts(p: ProfileExport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of COUNT_KEYS) out[k] = (p[k] as unknown[]).length;
  return out;
}

/** Validate + decide (LWW) WITHOUT writing — the confirm/preview step (§13). */
export async function previewImport(actor: AuthContext, raw: unknown): Promise<ImportPreview> {
  requireCapability(actor.roles, "profile.import");
  const parsed = profileExportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      decision: { action: "skip", reason: "File is not a valid profile export.", incomingExportedAt: "", existingExportedAt: null },
      studentId: "",
      counts: {},
      schemaVersion: 0,
      error: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  const p = parsed.data;
  // Forward-compat guard: a profile written by a future build may use different
  // collection shapes / date keys that v1's revive + replace logic would silently
  // corrupt. Refuse anything we don't know how to read (§13 is whole-student,
  // all-or-nothing — better to skip than to half-apply a mismatched format).
  if (p.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return {
      ok: false,
      decision: {
        action: "skip",
        reason: `Unsupported profile schema version ${p.schemaVersion} (this app reads v${PROFILE_SCHEMA_VERSION}).`,
        incomingExportedAt: p.exportedAt,
        existingExportedAt: null,
      },
      studentId: p.studentId,
      counts: counts(p),
      schemaVersion: p.schemaVersion,
      error: `unsupported schema version ${p.schemaVersion}`,
    };
  }
  const marker = await profileRepo.getMarker(p.studentId);
  const decision = decideProfileImport({ incomingExportedAt: p.exportedAt, existingExportedAt: marker });
  return { ok: true, decision, studentId: p.studentId, counts: counts(p), schemaVersion: p.schemaVersion };
}

export type ImportResult = ImportPreview & { applied: boolean };

/** Apply an import iff confirmed AND LWW says it's newer. */
export async function importProfile(actor: AuthContext, raw: unknown, confirm: boolean): Promise<ImportResult> {
  requireCapability(actor.roles, "profile.import");
  const preview = await previewImport(actor, raw);
  if (!preview.ok || !confirm || preview.decision.action !== "apply") {
    return { ...preview, applied: false };
  }
  const p = profileExportSchema.parse(raw);
  await profileRepo.replaceStudent(p.studentId, {
    exportedAt: p.exportedAt,
    user: reviveDates(p.user) as Doc,
    enrollments: reviveDates(p.enrollments) as Doc[],
    responses: reviveDates(p.responses) as Doc[],
    examSessions: reviveDates(p.examSessions) as Doc[],
    exams: reviveDates(p.exams) as Doc[],
    itemUsage: reviveDates(p.itemUsage) as Doc[],
    masteryStates: reviveDates(p.masteryStates) as Doc[],
    robuxLedger: reviveDates(p.robuxLedger) as Doc[],
    redemptions: reviveDates(p.redemptions) as Doc[],
    rewardRules: reviveDates(p.rewardRules) as Doc[],
    schedules: reviveDates(p.schedules) as Doc[],
    scoringJobs: reviveDates(p.scoringJobs) as Doc[],
  });
  return { ...preview, applied: true };
}
