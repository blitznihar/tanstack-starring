/**
 * Import a content bundle JSON through the single-upload path (Zod-validated,
 * upsert by programKey+subject+version).
 * Run: `bun run scripts/import-bundle.ts <path-to-bundle.json>`
 */
import { readFileSync } from "node:fs";
import { importBundle } from "~/server/content/import.js";
import { closeDb } from "~/repositories/db.js";
import type { AuthContext } from "~/server/auth/session.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun run scripts/import-bundle.ts <path-to-bundle.json>");
  process.exit(1);
}

const actor: AuthContext = {
  userId: "cli",
  username: "cli",
  displayName: "CLI",
  email: "blitznihar@gmail.com",
  emailConfirmed: true,
  roles: ["super_admin"],
  forceChangeOnFirstLogin: false,
};

const bundle = JSON.parse(readFileSync(path, "utf8"));
importBundle(actor, bundle)
  .then((r) => console.log(`Imported ${r.bundleId}: ${r.itemCount} items (${r.status})`))
  .catch((e) => {
    console.error("Import failed:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
