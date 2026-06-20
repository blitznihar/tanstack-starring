/**
 * Import a student profile JSON (§13), last-write-wins by `exportedAt`.
 *   bun run scripts/import-profile.ts <file> [--dry-run]
 * --dry-run previews the LWW decision + record counts without writing.
 */
import { readFileSync } from "node:fs";
import { previewImport, importProfile } from "~/server/profile-io/profile.js";
import { closeDb } from "~/repositories/db.js";
import type { AuthContext } from "~/server/auth/session.js";

const actor: AuthContext = {
  userId: "system",
  username: "system",
  displayName: "System",
  roles: ["super_admin"],
  forceChangeOnFirstLogin: false,
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("-")) throw new Error("Usage: import-profile.ts <file> [--dry-run]");
  const dry = process.argv.includes("--dry-run");
  const raw = JSON.parse(readFileSync(file, "utf8"));

  if (dry) {
    const preview = await previewImport(actor, raw);
    console.log(preview.ok ? "Preview OK" : `Invalid: ${preview.error}`);
    console.log(`  decision: ${preview.decision.action} — ${preview.decision.reason}`);
    console.log(`  counts:`, preview.counts);
    return;
  }

  const result = await importProfile(actor, raw, true);
  console.log(`  decision: ${result.decision.action} — ${result.decision.reason}`);
  console.log(`  applied: ${result.applied}`);
  if (result.applied) console.log(`  counts:`, result.counts);
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
