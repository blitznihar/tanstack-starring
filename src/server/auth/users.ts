import { randomUUID } from "node:crypto";
import { usersRepo } from "~/repositories/users.js";
import { createUserInputSchema, type CreateUserInput, type PublicUser } from "~/schemas/user.js";
import { DEFAULT_INITIAL_PASSWORD, hashPassword } from "./password.js";
import { requireCapability } from "./rbac.js";
import type { AuthContext } from "./session.js";

export type CreatedUser = {
  user: PublicUser;
  /** Plaintext password — returned ONCE for display; only the hash is stored. */
  generatedPassword: string;
};

/**
 * Create a user (admin/super_admin). Generates a strong password, stores only the
 * argon2id hash, and returns the plaintext once for the create-user "show
 * password" screen.
 */
export async function createUser(actor: AuthContext, rawInput: CreateUserInput): Promise<CreatedUser> {
  requireCapability(actor.roles, "users.manage");
  const input = createUserInputSchema.parse(rawInput);

  const existing = await usersRepo.findByUsername(input.username);
  if (existing) throw new Error(`Username already exists: ${input.username}`);

  const password = input.password?.trim() || DEFAULT_INITIAL_PASSWORD;
  const passwordHash = await hashPassword(password);
  const _id = randomUUID();

  const doc = await usersRepo.insert({
    _id,
    username: input.username,
    displayName: input.displayName,
    email: input.email.trim().toLowerCase(),
    emailConfirmed: false,
    roles: input.roles,
    studentIds: input.studentIds,
    parentIds: input.parentIds,
    passwordHash,
    forceChangeOnFirstLogin: input.forceChangeOnFirstLogin,
    active: true,
  });

  const { passwordHash: _omit, ...publicUser } = doc;
  return { user: publicUser as PublicUser, generatedPassword: password };
}

/** Reset a user's password (admin/super_admin), returning the new plaintext once. */
export async function resetPassword(actor: AuthContext, userId: string, forceChange = true): Promise<string> {
  requireCapability(actor.roles, "users.manage");
  const password = DEFAULT_INITIAL_PASSWORD;
  const passwordHash = await hashPassword(password);
  await usersRepo.updatePassword(userId, passwordHash, forceChange);
  return password;
}

export async function setPassword(actor: AuthContext, userId: string, password: string, forceChange = false): Promise<void> {
  requireCapability(actor.roles, "users.manage");
  const passwordHash = await hashPassword(password);
  await usersRepo.updatePassword(userId, passwordHash, forceChange);
}
