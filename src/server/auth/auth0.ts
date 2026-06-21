import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "~/lib/env.js";
import { usersRepo } from "~/repositories/users.js";
import { sessionsRepo } from "~/repositories/sessions.js";
import { generateToken } from "./password.js";
import type { Role } from "~/schemas/common.js";

export const AUTH0_STATE_COOKIE = "comet_auth0_state";
export const AUTH0_PENDING_COOKIE = "comet_auth0_pending";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PENDING_TTL_MS = 1000 * 60 * 10;

type Auth0UserInfo = {
  sub?: string;
  name?: string;
  nickname?: string;
  email?: string;
  email_verified?: boolean;
};

type UserMatch = {
  id: string;
  displayName: string;
  username: string;
  roles: Role[];
};

type Auth0StatePayload = {
  state: string;
  callbackUrl: string;
  exp: number;
};

type PendingPayload = {
  email: string;
  userIds: string[];
  exp: number;
};

export type Auth0ProfileChoice = UserMatch & {
  roleLabel: string;
  destination: "/admin/console" | "/student" | "/dashboard";
};

export type Auth0CompleteResult =
  | {
      ok: true;
      mode: "signed_in";
      token: string;
      roles: Role[];
      displayName: string;
      destination: "/admin/console" | "/student" | "/dashboard";
    }
  | {
      ok: true;
      mode: "select_profile";
      profiles: Auth0ProfileChoice[];
    }
  | {
      ok: false;
      message: string;
    };

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string): string {
  return createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
}

function signedJson(payload: Auth0StatePayload | PendingPayload): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function parseSignedJson(value: string | undefined): unknown {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(fromBase64url(body));
  } catch {
    return null;
  }
}

function isFreshPayload(payload: unknown): payload is { exp: number } {
  return !!payload && typeof payload === "object" && "exp" in payload && typeof payload.exp === "number" && payload.exp >= Date.now();
}

function auth0BaseUrl(): string {
  const domain = env.auth0.domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${domain}`;
}

function requireAuth0() {
  const config = env.auth0;
  if (!config.enabled) {
    throw new Error("Auth0 is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET.");
  }
  return config;
}

export function auth0Enabled(): boolean {
  return env.auth0.enabled;
}

export function newAuth0State(): string {
  return randomBytes(24).toString("base64url");
}

export function resolveAuth0CallbackUrl(callbackUrl?: string): string {
  return callbackUrl?.trim() || env.auth0.callbackUrl;
}

export function auth0StateCookie(state: string, callbackUrl: string, secure: boolean): string {
  const payload = signedJson({ state, callbackUrl: resolveAuth0CallbackUrl(callbackUrl), exp: Date.now() + PENDING_TTL_MS });
  const parts = [
    `${AUTH0_STATE_COOKIE}=${encodeURIComponent(payload)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAuth0StateCookie(secure: boolean): string {
  const parts = [`${AUTH0_STATE_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function auth0PendingCookie(email: string, userIds: string[], secure: boolean): string {
  const payload = signedJson({ email, userIds, exp: Date.now() + PENDING_TTL_MS });
  const parts = [
    `${AUTH0_PENDING_COOKIE}=${encodeURIComponent(payload)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAuth0PendingCookie(secure: boolean): string {
  const parts = [`${AUTH0_PENDING_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readAuth0StateCookie(value: string | undefined): Auth0StatePayload | null {
  const payload = parseSignedJson(value);
  if (!isFreshPayload(payload)) return null;
  if (!("state" in payload) || typeof payload.state !== "string") return null;
  if (!("callbackUrl" in payload) || typeof payload.callbackUrl !== "string") return null;
  return { state: payload.state, callbackUrl: payload.callbackUrl, exp: payload.exp };
}

export function readAuth0PendingCookie(value: string | undefined): PendingPayload | null {
  const payload = parseSignedJson(value);
  if (!isFreshPayload(payload)) return null;
  if (!("email" in payload) || typeof payload.email !== "string" || !payload.email) return null;
  if (!("userIds" in payload) || !Array.isArray(payload.userIds)) return null;
  if (!payload.userIds.every((id) => typeof id === "string")) return null;
  return { email: payload.email, userIds: payload.userIds, exp: payload.exp };
}

export function buildAuth0AuthorizeUrl(state: string, callbackUrl?: string): string {
  const config = requireAuth0();
  const url = new URL("/authorize", auth0BaseUrl());
  const redirectUri = resolveAuth0CallbackUrl(callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "login");
  if (config.connection.trim()) url.searchParams.set("connection", config.connection.trim());
  return url.toString();
}

function destination(roles: Role[]): "/admin/console" | "/student" | "/dashboard" {
  if (roles.includes("admin") || roles.includes("super_admin")) return "/admin/console";
  if (roles.includes("student")) return "/student";
  return "/dashboard";
}

function roleLabel(roles: Role[]): string {
  if (roles.includes("super_admin")) return "Super Admin";
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("parent")) return "Parent";
  if (roles.includes("student")) return "Student";
  return "Profile";
}

function toProfileChoice(user: UserMatch): Auth0ProfileChoice {
  return { ...user, roleLabel: roleLabel(user.roles), destination: destination(user.roles) };
}

async function exchangeCode(code: string, callbackUrl: string): Promise<string> {
  const config = requireAuth0();
  const response = await fetch(new URL("/oauth/token", auth0BaseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Auth0 token exchange failed.");
  }
  return payload.access_token;
}

async function userInfo(accessToken: string): Promise<Auth0UserInfo> {
  const response = await fetch(new URL("/userinfo", auth0BaseUrl()), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({})) as Auth0UserInfo;
  if (!response.ok) throw new Error("Auth0 user lookup failed.");
  return payload;
}

async function activeUsersForEmail(email: string): Promise<UserMatch[]> {
  const users = await usersRepo.listByEmail(email);
  return users
    .filter((user) => user.active && user._id)
    .map((user) => ({
      id: String(user._id),
      displayName: user.displayName,
      username: user.username,
      roles: user.roles,
    }));
}

export async function createSessionForAuth0User(userId: string) {
  const user = await usersRepo.findById(userId);
  if (!user || !user._id || !user.active) throw new Error("Selected profile is not available.");
  await usersRepo.update(String(user._id), { emailConfirmed: true, forceChangeOnFirstLogin: false });
  const token = generateToken();
  await sessionsRepo.create(token, String(user._id), SESSION_TTL_MS);
  return {
    token,
    roles: user.roles,
    displayName: user.displayName,
    destination: destination(user.roles),
  };
}

export async function completeAuth0Login(input: {
  code: string;
  state: string;
  expectedState: Auth0StatePayload | null;
}): Promise<Auth0CompleteResult> {
  try {
    if (!input.expectedState || input.expectedState.state !== input.state) {
      return { ok: false, message: "The login session expired. Please try signing in again." };
    }
    const accessToken = await exchangeCode(input.code, input.expectedState.callbackUrl);
    const info = await userInfo(accessToken);
    const email = info.email?.trim().toLowerCase();
    if (!email || info.email_verified === false) {
      return { ok: false, message: "Auth0 did not return a verified email address." };
    }

    const matches = await activeUsersForEmail(email);
    if (matches.length === 0) {
      return {
        ok: false,
        message: "This Google account is not enabled for Comet Academy. Ask an admin to add that Gmail address to Users.",
      };
    }
    if (matches.length > 1) {
      return { ok: true, mode: "select_profile", profiles: matches.map(toProfileChoice) };
    }

    const session = await createSessionForAuth0User(matches[0]!.id);
    return { ok: true, mode: "signed_in", ...session };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Auth0 sign-in failed.",
    };
  }
}

export async function selectPendingAuth0Profile(input: {
  userId: string;
  pending: PendingPayload | null;
}) {
  if (!input.pending) throw new Error("The login profile selection expired. Please sign in again.");
  if (!input.pending.userIds.includes(input.userId)) throw new Error("That profile is not available for this login.");
  const user = await usersRepo.findById(input.userId);
  if (!user || !user._id || !user.active || user.email.toLowerCase() !== input.pending.email) {
    throw new Error("That profile is not available for this login.");
  }
  return createSessionForAuth0User(String(user._id));
}
