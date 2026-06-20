import { lessonImportSchema, type LessonDoc, type LessonImport } from "~/schemas/lesson.js";
import { lessonsRepo } from "~/repositories/lessons.js";
import { requireCapability } from "~/server/auth/rbac.js";
import type { AuthContext } from "~/server/auth/session.js";

export type LessonImportResult = {
  programKey: string;
  lessonCount: number;
  subjects: string[];
  standards: string[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function lessonId(lesson: LessonImport): string {
  return `${lesson.programKey}:${lesson.subject}:${lesson.standardCode}:lesson:v${lesson.version}`;
}

function extractLessons(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const payload = asObject(raw);
  const candidates = [
    ...asArray(payload.lessons),
    ...asArray(payload.lesson),
  ].filter((entry) => entry && typeof entry === "object");
  if ("lessons" in payload || "lesson" in payload) return candidates;
  return candidates.length ? candidates : Object.keys(payload).length ? [payload] : [];
}

export function prepareLessonUpload(programKey: string, raw: unknown): LessonDoc[] {
  const payload = asObject(raw);
  const lessons = extractLessons(raw);
  if (lessons.length === 0) throw new Error("No lessons were found in the JSON file.");

  const now = new Date();
  const ids = new Set<string>();
  return lessons.map((entry, index) => {
    const obj = asObject(entry);
    const parsed = lessonImportSchema.parse({
      ...obj,
      programKey: obj.programKey ?? programKey,
      subject: obj.subject ?? payload.subject,
      version: obj.version ?? payload.version ?? index + 1,
      status: obj.status ?? payload.status ?? "available",
    });
    const _id = parsed._id ?? lessonId(parsed);
    if (ids.has(_id)) throw new Error(`Duplicate lesson _id in upload: ${_id}`);
    ids.add(_id);
    return {
      ...parsed,
      _id,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export async function importLessons(actor: AuthContext, programKey: string, raw: unknown): Promise<LessonImportResult> {
  requireCapability(actor.roles, "content.import");
  const lessons = prepareLessonUpload(programKey, raw);
  await lessonsRepo.upsertMany(lessons);
  return {
    programKey,
    lessonCount: lessons.length,
    subjects: [...new Set(lessons.map((lesson) => lesson.subject))].sort(),
    standards: [...new Set(lessons.map((lesson) => lesson.standardCode))].sort(),
  };
}
