import argon2 from "argon2";
import { randomBytes, randomInt } from "node:crypto";

/**
 * Password hashing (argon2id) and strong-password generation.
 * On user creation we generate a strong password, return it ONCE for display,
 * and store only the argon2id hash.
 */

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l/o
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O
const DIGITS = "23456789"; // no 0/1
const SYMBOLS = "!@#$%^&*?";

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

/** Generate a strong, human-readable password with at least one of each class. */
export function generatePassword(length = 16): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest: string[] = [];
  for (let i = required.length; i < length; i++) rest.push(pick(all));
  const chars = [...required, ...rest];
  // Fisher–Yates shuffle using crypto randomness.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Opaque session token. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
