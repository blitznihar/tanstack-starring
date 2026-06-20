import { createServerFn } from "@tanstack/react-start";
import { exportProfile, previewImport, importProfile } from "~/server/profile-io/profile.js";
import { requireAuth } from "./context.js";

/** Export a student's whole profile as a downloadable JSON string (§13). */
export const exportProfileFn = createServerFn({ method: "GET" })
  .validator((d?: { studentId?: string }) => ({ studentId: d?.studentId }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const payload = await exportProfile(auth, data.studentId);
    return {
      filename: `comet-profile-${payload.studentId}-${payload.exportedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`,
      json: JSON.stringify(payload, null, 2),
      studentId: payload.studentId,
      exportedAt: payload.exportedAt,
    };
  });

/** Dry-run an import: validate + LWW decision + counts, no writes (§13 preview). */
export const previewImportFn = createServerFn({ method: "POST" })
  .validator((d: { json: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    let raw: unknown;
    try {
      raw = JSON.parse(data.json);
    } catch {
      return {
        ok: false as const,
        decision: { action: "skip" as const, reason: "That file is not valid JSON.", incomingExportedAt: "", existingExportedAt: null },
        studentId: "",
        counts: {} as Record<string, number>,
        schemaVersion: 0,
        error: "invalid JSON",
      };
    }
    return previewImport(auth, raw);
  });

/** Apply an import (confirm step) — only writes if LWW says newer. */
export const importProfileFn = createServerFn({ method: "POST" })
  .validator((d: { json: string; confirm: boolean }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    let raw: unknown;
    try {
      raw = JSON.parse(data.json);
    } catch {
      // Mirror previewImportFn: a malformed body returns the no-op shape, never a 500.
      return {
        ok: false as const,
        applied: false,
        decision: { action: "skip" as const, reason: "That file is not valid JSON.", incomingExportedAt: "", existingExportedAt: null },
        studentId: "",
        counts: {} as Record<string, number>,
        schemaVersion: 0,
        error: "invalid JSON",
      };
    }
    return importProfile(auth, raw, data.confirm);
  });
