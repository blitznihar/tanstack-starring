/**
 * Export one student's whole profile to JSON (§13). Content is excluded.
 *   bun run scripts/export-profile.ts [studentId] [outFile]
 * With no studentId, exports the first seeded student (Maya).
 */
import { writeFileSync } from "node:fs";
import { exportProfile } from "~/server/profile-io/profile.js";
import { closeDb } from "~/repositories/db.js";
import type { AuthContext } from "~/server/auth/session.js";

const actor: AuthContext = {
  userId: "system",
  username: "system",
  displayName: "System",
  email: "blitznihar@gmail.com",
  emailConfirmed: true,
  roles: ["super_admin"],
  forceChangeOnFirstLogin: false,
};

async function main() {
  const studentId = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : undefined;
  const payload = await exportProfile(actor, studentId);
  const out = process.argv[3] ?? `profile-${payload.studentId}.json`;
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
  const counts = payload as unknown as Record<string, unknown[]>;
  const total = ["enrollments", "responses", "examSessions", "exams", "masteryStates", "robuxLedger", "redemptions", "schedules", "scoringJobs"]
    .reduce((n, k) => n + (counts[k]?.length ?? 0), 0);
  console.log(`Exported profile for ${payload.studentId} (exportedAt ${payload.exportedAt})`);
  console.log(`  ${total} records across ${payload.enrollments.length} enrollments → ${out}`);
}

main()
  .catch((err) => {
    console.error("Export failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
