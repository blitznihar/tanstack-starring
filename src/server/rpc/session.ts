import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { usersRepo } from "~/repositories/users.js";
import { sessionsRepo } from "~/repositories/sessions.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { generateToken } from "~/server/auth/password.js";
import { login as doLogin, logout as doLogout, sessionCookie, clearSessionCookie, SESSION_COOKIE } from "~/server/auth/session.js";
import { roleSchema } from "~/schemas/common.js";
import { currentAuth } from "./context.js";
import { getRequestHeader } from "@tanstack/react-start/server";

const isProd = process.env.NODE_ENV === "production";

/** Current signed-in user (or null). */
export const me = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await currentAuth();
  return auth ? { userId: auth.userId, displayName: auth.displayName, username: auth.username, roles: auth.roles } : null;
});

/** Real credential login. */
export const login = createServerFn({ method: "POST" })
  .validator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const result = await doLogin(data);
    if (!result) return { ok: false as const };
    setResponseHeader("Set-Cookie", sessionCookie(result.token, isProd));
    return { ok: true as const, roles: result.auth.roles };
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
    if (isProd) throw new Error("devLogin is disabled in production");
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
    if (isProd) throw new Error("devProfileLogin is disabled in production");
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
