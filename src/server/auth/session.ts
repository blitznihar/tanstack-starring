import { usersRepo } from "~/repositories/users.js";
import { sessionsRepo } from "~/repositories/sessions.js";
import { generateToken, verifyPassword } from "./password.js";
import type { LoginInput } from "~/schemas/user.js";
import type { Role } from "~/schemas/common.js";

export const SESSION_COOKIE = "comet_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type AuthContext = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  emailConfirmed: boolean;
  roles: Role[];
  forceChangeOnFirstLogin: boolean;
};

/** Validate credentials and create a session. Returns the token + auth context. */
export async function login(input: LoginInput): Promise<{ token: string; auth: AuthContext } | null> {
  const user = await usersRepo.findByUsername(input.username);
  if (!user || !user.active || !user._id) return null;
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) return null;
  const token = generateToken();
    await sessionsRepo.create(token, String(user._id), SESSION_TTL_MS);
    return {
      token,
      auth: {
        userId: String(user._id),
      username: user.username,
      displayName: user.displayName,
      email: user.email ?? "blitznihar@gmail.com",
      emailConfirmed: !!user.emailConfirmed,
      roles: user.roles,
      forceChangeOnFirstLogin: user.forceChangeOnFirstLogin,
    },
  };
}

/** Resolve the auth context from a session token (cookie value). */
export async function authFromToken(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const session = await sessionsRepo.find(token);
  if (!session) return null;
  const user = await usersRepo.findById(String(session.userId));
  if (!user || !user.active || !user._id) return null;
  return {
    userId: String(user._id),
    username: user.username,
    displayName: user.displayName,
    email: user.email ?? "blitznihar@gmail.com",
    emailConfirmed: !!user.emailConfirmed,
    roles: user.roles,
    forceChangeOnFirstLogin: user.forceChangeOnFirstLogin,
  };
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await sessionsRepo.destroy(token);
}

/** Build the Set-Cookie header value for the session (HTTP-only, secure). */
export function sessionCookie(token: string, secure = true): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure = true): string {
  const parts = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
