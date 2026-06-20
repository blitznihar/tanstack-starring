import { getRequestHeader } from "@tanstack/react-start/server";
import { authFromToken, SESSION_COOKIE, type AuthContext } from "~/server/auth/session.js";

/** Parse a Cookie header into a map. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** Resolve the current auth context from the request's session cookie (server-only). */
export async function currentAuth(): Promise<AuthContext | null> {
  const cookies = parseCookies(getRequestHeader("cookie"));
  return authFromToken(cookies[SESSION_COOKIE]);
}

/** Throwing variant for routes/server-fns that require a signed-in user. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await currentAuth();
  if (!auth) throw new Error("Not authenticated");
  return auth;
}
