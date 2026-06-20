import { z } from "zod";

/**
 * Whole-student profile export/import (§13). One student across ALL their
 * enrollments. **Content is excluded** — programs/bundles are referenced by key
 * only, never copied. Import is whole-profile **last-write-wins by `exportedAt`**:
 * a newer export replaces, an older one is skipped with a warning, and a
 * confirm/preview is shown before any overwrite.
 *
 * Collection payloads are kept as loose document arrays (one array per
 * collection) so the schema does not have to re-declare every repo's shape; the
 * importer revives known Date fields and writes them back through the repos.
 */

export const PROFILE_SCHEMA_VERSION = 1;

const docArray = z.array(z.record(z.string(), z.unknown())).default([]);

export const profileExportSchema = z.object({
  schemaVersion: z.number().int().positive(),
  /** ISO timestamp — the LWW key. Newer wins. */
  exportedAt: z.string().min(1),
  studentId: z.string().min(1),
  /** Program keys this student is enrolled in (reference only; not the content). */
  programKeys: z.array(z.string()).default([]),
  /** User doc WITHOUT passwordHash (§13). Loose so JSON date strings round-trip. */
  user: z.record(z.string(), z.unknown()),
  enrollments: docArray,
  responses: docArray,
  examSessions: docArray, // includes per-session `result` payloads
  exams: docArray,
  itemUsage: docArray,
  masteryStates: docArray,
  robuxLedger: docArray,
  redemptions: docArray,
  rewardRules: docArray, // per-student reward rules only (program-wide config excluded)
  schedules: docArray,
  scoringJobs: docArray,
});
export type ProfileExport = z.infer<typeof profileExportSchema>;
