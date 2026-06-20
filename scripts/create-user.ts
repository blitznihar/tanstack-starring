/**
 * Create a user from the CLI; prints the generated password ONCE.
 * Run: `bun run scripts/create-user.ts <username> <displayName> <role[,role...]>`
 */
import { createUser } from "~/server/auth/users.js";
import { closeDb } from "~/repositories/db.js";
import { roleSchema, type Role } from "~/schemas/common.js";
import type { AuthContext } from "~/server/auth/session.js";

const [username, displayName, rolesArg] = process.argv.slice(2);
if (!username || !displayName || !rolesArg) {
  console.error("Usage: bun run scripts/create-user.ts <username> <displayName> <role[,role...]>");
  process.exit(1);
}

const roles = rolesArg.split(",").map((r) => roleSchema.parse(r.trim())) as Role[];

const actor: AuthContext = {
  userId: "cli",
  username: "cli",
  displayName: "CLI",
  roles: ["super_admin"],
  forceChangeOnFirstLogin: false,
};

createUser(actor, { username, displayName, roles, forceChangeOnFirstLogin: true })
  .then((r) => {
    console.log(`Created ${r.user.username} (${r.user.roles.join(", ")})`);
    console.log(`Password (shown once): ${r.generatedPassword}`);
  })
  .catch((e) => {
    console.error("Create failed:", e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
