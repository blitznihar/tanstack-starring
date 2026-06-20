import { usersRepo } from "~/repositories/users.js";
import type { Role } from "~/schemas/common.js";
import type { User } from "~/schemas/user.js";
import type { AuthContext } from "~/server/auth/session.js";

type UserDoc = User & { _id?: string };

const ROLE_PRIORITY: Role[] = ["super_admin", "admin", "parent", "student"];

export function roleFor(roles: Role[]): Role {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? roles[0] ?? "student";
}

export function userId(user: UserDoc): string {
  return user._id ? String(user._id) : user.username;
}

export function isSuperAdmin(actor: Pick<AuthContext, "roles">): boolean {
  return actor.roles.includes("super_admin");
}

export function isAdmin(actor: Pick<AuthContext, "roles">): boolean {
  return actor.roles.includes("admin");
}

export function allowedConsoleRoles(actor: Pick<AuthContext, "roles">): Role[] {
  if (isSuperAdmin(actor)) return ["student", "parent", "admin", "super_admin"];
  if (isAdmin(actor)) return ["student", "parent"];
  return [];
}

function activeUsersByRole(users: UserDoc[], role: Role): UserDoc[] {
  return users.filter((user) => user.active && user.roles.includes(role));
}

function storedIds(user: UserDoc | null | undefined, key: "studentIds" | "parentIds"): string[] | null {
  const value = user ? (user as unknown as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map(String).filter(Boolean))];
}

function parentStudentIds(parent: UserDoc, allStudents: UserDoc[]): string[] {
  const ids = storedIds(parent, "studentIds");
  if (ids) return ids;
  return allStudents.map(userId);
}

function adminParentIds(admin: UserDoc, allParents: UserDoc[]): string[] {
  const ids = storedIds(admin, "parentIds");
  if (ids) return ids;
  return allParents.map(userId);
}

export async function currentUser(actor: AuthContext): Promise<UserDoc | null> {
  return usersRepo.findById(actor.userId);
}

export async function visibleParentsFor(actor: AuthContext, users?: UserDoc[]): Promise<UserDoc[]> {
  const allUsers = users ?? (await usersRepo.list());
  const parents = activeUsersByRole(allUsers, "parent");
  if (isSuperAdmin(actor)) return parents;

  const actorUser = allUsers.find((user) => userId(user) === actor.userId) ?? (await currentUser(actor));
  if (!actorUser) return [];

  if (isAdmin(actor)) {
    const ids = new Set(adminParentIds(actorUser, parents));
    return parents.filter((parent) => ids.has(userId(parent)));
  }

  if (actor.roles.includes("parent")) return parents.filter((parent) => userId(parent) === actor.userId);
  return [];
}

export async function visibleStudentsFor(actor: AuthContext, users?: UserDoc[]): Promise<UserDoc[]> {
  const allUsers = users ?? (await usersRepo.list());
  const students = activeUsersByRole(allUsers, "student");
  if (isSuperAdmin(actor)) return students;
  if (actor.roles.includes("student")) return students.filter((student) => userId(student) === actor.userId);

  const actorUser = allUsers.find((user) => userId(user) === actor.userId) ?? (await currentUser(actor));
  if (!actorUser) return [];

  if (actor.roles.includes("parent")) {
    const ids = new Set(parentStudentIds(actorUser, students));
    return students.filter((student) => ids.has(userId(student)));
  }

  if (isAdmin(actor)) {
    const parents = activeUsersByRole(allUsers, "parent");
    const parentIds = new Set(adminParentIds(actorUser, parents));
    const studentIds = new Set<string>();
    for (const studentId of storedIds(actorUser, "studentIds") ?? []) studentIds.add(studentId);
    for (const parent of parents) {
      if (!parentIds.has(userId(parent))) continue;
      for (const studentId of parentStudentIds(parent, students)) studentIds.add(studentId);
    }
    return students.filter((student) => studentIds.has(userId(student)));
  }

  return [];
}

export async function visibleUsersFor(actor: AuthContext, users?: UserDoc[]): Promise<UserDoc[]> {
  const allUsers = users ?? (await usersRepo.list());
  if (isSuperAdmin(actor)) return allUsers;
  if (!isAdmin(actor)) return [];

  const [parents, students] = await Promise.all([visibleParentsFor(actor, allUsers), visibleStudentsFor(actor, allUsers)]);
  const allowedIds = new Set([actor.userId, ...parents.map(userId), ...students.map(userId)]);
  return allUsers.filter((user) => allowedIds.has(userId(user)));
}

export async function canManageUser(actor: AuthContext, target: UserDoc): Promise<boolean> {
  if (isSuperAdmin(actor)) return true;
  if (!isAdmin(actor)) return false;
  if (userId(target) === actor.userId) return false;

  const targetRole = roleFor(target.roles);
  if (targetRole !== "student" && targetRole !== "parent") return false;

  const visible = targetRole === "student" ? await visibleStudentsFor(actor) : await visibleParentsFor(actor);
  const visibleIds = new Set(visible.map(userId));
  return visibleIds.has(userId(target));
}

export async function assertCanSeeStudent(actor: AuthContext, studentId: string): Promise<void> {
  const visible = await visibleStudentsFor(actor);
  if (!visible.some((student) => userId(student) === studentId)) throw new Error("Forbidden: student is not associated with this account");
}

export async function parentsForStudent(studentId: string): Promise<UserDoc[]> {
  const users = await usersRepo.list();
  const students = activeUsersByRole(users, "student");
  return activeUsersByRole(users, "parent").filter((parent) => parentStudentIds(parent, students).includes(studentId));
}

export function publicUserOption(user: UserDoc): { id: string; displayName: string; username: string } {
  return { id: userId(user), displayName: user.displayName, username: user.username };
}
