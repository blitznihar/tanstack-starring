/**
 * Whole-profile import is LAST-WRITE-WINS by `exportedAt` (§13): a newer export
 * replaces, an older (or equal) one is skipped with a warning. PURE so the rule is
 * unit-tested independently of Mongo. `existingExportedAt` is the timestamp of the
 * export that last populated this machine (null if the student has never been
 * imported here). ISO-8601 strings sort lexicographically, so plain string
 * comparison is correct and timezone-safe.
 */

export type ImportDecision = {
  action: "apply" | "skip";
  reason: string;
  incomingExportedAt: string;
  existingExportedAt: string | null;
};

export function decideProfileImport(input: {
  incomingExportedAt: string;
  existingExportedAt: string | null;
}): ImportDecision {
  const { incomingExportedAt, existingExportedAt } = input;
  if (!existingExportedAt) {
    return { action: "apply", reason: "No existing profile on this machine — importing fresh.", incomingExportedAt, existingExportedAt };
  }
  if (incomingExportedAt > existingExportedAt) {
    return {
      action: "apply",
      reason: `Incoming export (${incomingExportedAt}) is newer than the current profile (${existingExportedAt}) — replacing.`,
      incomingExportedAt,
      existingExportedAt,
    };
  }
  return {
    action: "skip",
    reason: `Incoming export (${incomingExportedAt}) is not newer than the current profile (${existingExportedAt}) — skipped.`,
    incomingExportedAt,
    existingExportedAt,
  };
}
