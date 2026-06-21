import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { usersRepo } from "~/repositories/users.js";
import { sessionsRepo } from "~/repositories/sessions.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { DEFAULT_INITIAL_PASSWORD, generateToken, hashPassword, verifyPassword } from "~/server/auth/password.js";
import { login as doLogin, logout as doLogout, sessionCookie, clearSessionCookie, SESSION_COOKIE } from "~/server/auth/session.js";
import {
  AUTH0_PENDING_COOKIE,
  AUTH0_STATE_COOKIE,
  auth0Enabled,
  auth0PendingCookie,
  auth0StateCookie,
  buildAuth0AuthorizeUrl,
  clearAuth0PendingCookie,
  clearAuth0StateCookie,
  completeAuth0Login,
  newAuth0State,
  readAuth0PendingCookie,
  readAuth0StateCookie,
  resolveAuth0CallbackUrl,
  selectPendingAuth0Profile,
} from "~/server/auth/auth0.js";
import { roleSchema } from "~/schemas/common.js";
import { queueEmailNotification } from "~/server/notifications/email.js";
import { currentAuth } from "./context.js";

const isProd = process.env.NODE_ENV === "production";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function requestOrigin(): string | undefined {
  const origin = getRequestHeader("origin");
  if (origin) return origin;
  const referer = getRequestHeader("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/** Current signed-in user (or null). */
export const me = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await currentAuth();
  return auth ? {
    userId: auth.userId,
    displayName: auth.displayName,
    username: auth.username,
    email: auth.email,
    emailConfirmed: auth.emailConfirmed,
    forceChangeOnFirstLogin: auth.forceChangeOnFirstLogin,
    roles: auth.roles,
  } : null;
});

/** Real credential login. */
export const login = createServerFn({ method: "POST" })
  .validator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    if (auth0Enabled()) return { ok: false as const, auth0Required: true as const };
    const result = await doLogin(data);
    if (!result) return { ok: false as const };
    setResponseHeader("Set-Cookie", sessionCookie(result.token, isProd));
    return {
      ok: true as const,
      roles: result.auth.roles,
      displayName: result.auth.displayName,
      needsAccountSetup: !result.auth.emailConfirmed || result.auth.forceChangeOnFirstLogin,
    };
  });

export const auth0Status = createServerFn({ method: "GET" }).handler(async () => ({
  enabled: auth0Enabled(),
}));

export const startAuth0Login = createServerFn({ method: "POST" }).handler(async () => {
  const state = newAuth0State();
  const origin = requestOrigin();
  const callbackUrl = resolveAuth0CallbackUrl(origin ? `${origin}/callback` : undefined);
  const url = buildAuth0AuthorizeUrl(state, callbackUrl);
  setResponseHeader("Set-Cookie", auth0StateCookie(state, callbackUrl, isProd));
  return { ok: true as const, url };
});

export const finishAuth0Login = createServerFn({ method: "POST" })
  .validator((d: { code: string; state: string }) => ({
    code: String(d.code ?? ""),
    state: String(d.state ?? ""),
  }))
  .handler(async ({ data }) => {
    const cookies = parseCookies(getRequestHeader("cookie"));
    const result = await completeAuth0Login({
      code: data.code,
      state: data.state,
      expectedState: readAuth0StateCookie(cookies[AUTH0_STATE_COOKIE]),
    });

    if (!result.ok) {
      setResponseHeader("Set-Cookie", [clearAuth0StateCookie(isProd), clearAuth0PendingCookie(isProd)]);
      return result;
    }

    if (result.mode === "select_profile") {
      const email = (await usersRepo.findById(result.profiles[0]!.id))?.email.toLowerCase() ?? "";
      setResponseHeader("Set-Cookie", [
        clearAuth0StateCookie(isProd),
        auth0PendingCookie(email, result.profiles.map((profile) => profile.id), isProd),
      ]);
      return result;
    }

    setResponseHeader("Set-Cookie", [
      clearAuth0StateCookie(isProd),
      clearAuth0PendingCookie(isProd),
      sessionCookie(result.token, isProd),
    ]);
    return {
      ok: true as const,
      mode: "signed_in" as const,
      roles: result.roles,
      displayName: result.displayName,
      destination: result.destination,
    };
  });

export const selectAuth0Profile = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => ({ userId: String(d.userId ?? "") }))
  .handler(async ({ data }) => {
    const cookies = parseCookies(getRequestHeader("cookie"));
    const session = await selectPendingAuth0Profile({
      userId: data.userId,
      pending: readAuth0PendingCookie(cookies[AUTH0_PENDING_COOKIE]),
    });
    setResponseHeader("Set-Cookie", [
      clearAuth0PendingCookie(isProd),
      sessionCookie(session.token, isProd),
    ]);
    return {
      ok: true as const,
      roles: session.roles,
      displayName: session.displayName,
      destination: session.destination,
    };
  });

export const confirmMyEmail = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => ({ email: String(d.email).trim().toLowerCase() }))
  .handler(async ({ data }) => {
    const auth = await currentAuth();
    if (!auth) throw new Error("Not authenticated");
    await usersRepo.update(auth.userId, { email: data.email, emailConfirmed: true });
    await queueEmailNotification({
      userId: auth.userId,
      kind: "email_confirmation",
      subject: "Email address confirmed",
      body: `Your Comet Academy email address was confirmed as ${data.email}.`,
    });
    return { ok: true as const, email: data.email };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .validator((d: { currentPassword: string; newPassword: string }) => ({
    currentPassword: String(d.currentPassword ?? ""),
    newPassword: String(d.newPassword ?? ""),
  }))
  .handler(async ({ data }) => {
    const auth = await currentAuth();
    if (!auth) throw new Error("Not authenticated");
    if (data.newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
    const user = await usersRepo.findById(auth.userId);
    if (!user) throw new Error("User not found");
    const ok = await verifyPassword(user.passwordHash, data.currentPassword);
    if (!ok) throw new Error("Current password did not match.");
    await usersRepo.updatePassword(auth.userId, await hashPassword(data.newPassword), false);
    return { ok: true as const };
  });

export const forgotPassword = createServerFn({ method: "POST" })
  .validator((d: { usernameOrEmail: string }) => ({ usernameOrEmail: String(d.usernameOrEmail ?? "").trim() }))
  .handler(async ({ data }) => {
    const key = data.usernameOrEmail;
    if (!key) return { ok: true as const };
    const matches = key.includes("@")
      ? await usersRepo.listByEmail(key.toLowerCase())
      : [await usersRepo.findByUsername(key)].filter((user): user is NonNullable<typeof user> => !!user);
    for (const user of matches) {
      if (!user._id) continue;
      await usersRepo.updatePassword(String(user._id), await hashPassword(DEFAULT_INITIAL_PASSWORD), true);
      await queueEmailNotification({
        userId: String(user._id),
        kind: "password_reset",
        subject: "Comet Academy password reset",
        body: `Your password was reset to ${DEFAULT_INITIAL_PASSWORD}. Sign in and choose a new password from Account Setup.`,
      });
    }
    return { ok: true as const };
  });

function routeForRoles(roles: string[]): "/admin/console" | "/student" | "/dashboard" {
  if (roles.includes("admin") || roles.includes("super_admin")) return "/admin/console";
  if (roles.includes("student")) return "/student";
  return "/dashboard";
}

function roleLabel(roles: string[]): string {
  if (roles.includes("super_admin")) return "Super Admin";
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("parent")) return "Parent";
  if (roles.includes("student")) return "Student";
  return "Profile";
}

function profileSubtitle(roles: string[], activeProgramTitles: string[]): string {
  if (activeProgramTitles.length) return activeProgramTitles.join(" + ");
  if (roles.includes("super_admin")) return "Full platform control";
  if (roles.includes("admin")) return "Console, content, scoring";
  if (roles.includes("parent")) return "Reports, rewards, billing";
  if (roles.includes("student")) return "Dashboard, practice, wallet";
  return roles.map((role) => role.replace(/_/g, " ")).join(", ");
}

/** Dynamic demo profile list for the login page. */
export const loginProfiles = createServerFn({ method: "GET" }).handler(async () => {
  if (isProd) return [];
  const [users, programs] = await Promise.all([usersRepo.list(), programsRepo.list()]);
  const programTitles = new Map(programs.map((program) => [program.key, program.title]));

  return Promise.all(
    users
      .filter((user) => user.active && user._id)
      .map(async (user) => {
        const id = String(user._id);
        const enrollments = user.roles.includes("student")
          ? await enrollmentsRepo.listForStudent(id)
          : [];
        const activeProgramTitles = enrollments
          .filter((enrollment) => enrollment.status === "active")
          .map((enrollment) => programTitles.get(enrollment.programKey) ?? enrollment.programKey);
        return {
          id,
          username: user.username,
          displayName: user.displayName,
          roles: user.roles,
          roleLabel: roleLabel(user.roles),
          destination: routeForRoles(user.roles),
          subtitle: profileSubtitle(user.roles, activeProgramTitles),
        };
      }),
  );
});

/**
 * Dev role-picker login (matches the prototype's password-less role cards).
 * Establishes a REAL session for the seeded demo account of that role. Disabled
 * in production.
 */
export const devLogin = createServerFn({ method: "POST" })
  .validator((d: { role: string }) => ({ role: roleSchema.parse(d.role) }))
  .handler(async ({ data }) => {
    if (isProd || auth0Enabled()) throw new Error("devLogin is disabled when Auth0 login is configured");
    const user = await usersRepo.findByRole(data.role);
    if (!user || !user._id) throw new Error(`No seeded ${data.role} user — run \`bun run seed\``);
    const token = generateToken();
    await sessionsRepo.create(token, String(user._id), 1000 * 60 * 60 * 24 * 7);
    setResponseHeader("Set-Cookie", sessionCookie(token, isProd));
    return { ok: true as const, roles: user.roles, displayName: user.displayName };
  });

/** Password-less demo login for a specific dynamic profile card. */
export const devProfileLogin = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => ({ userId: String(d.userId) }))
  .handler(async ({ data }) => {
    if (isProd || auth0Enabled()) throw new Error("devProfileLogin is disabled when Auth0 login is configured");
    const user = await usersRepo.findById(data.userId);
    if (!user || !user._id || !user.active) throw new Error("Profile is not available");
    const token = generateToken();
    await sessionsRepo.create(token, String(user._id), 1000 * 60 * 60 * 24 * 7);
    setResponseHeader("Set-Cookie", sessionCookie(token, isProd));
    return { ok: true as const, roles: user.roles, displayName: user.displayName };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const header = getRequestHeader("cookie") ?? "";
  const token = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  await doLogout(token);
  setResponseHeader("Set-Cookie", clearSessionCookie(isProd));
  return { ok: true as const };
});
