import type { Role } from "~/schemas/common.js";

/**
 * Capability-based RBAC (§3). Capabilities are enforced server-side in every
 * server function. Accounts are single-role in normal use; the array shape is
 * retained for older data and migration safety.
 */
export type Capability =
  // super_admin only
  | "pricing.manage"
  | "demo.configure"
  // admin + super_admin
  | "users.manage"
  | "content.import"
  | "content.browse"
  | "exam.build"
  | "concept.configure"
  | "scoring.override"
  | "rewards.configure"
  | "robuxRules.configure"
  | "redemption.fulfill"
  | "profile.export"
  | "profile.import"
  | "billing.subscribe"
  | "reports.viewAll"
  // parent
  | "reports.viewChild"
  | "payment.make"
  // student
  | "learn.do"
  | "progress.viewOwn"
  | "redemption.request"
  | "workAhead";

const ROLE_CAPS: Record<Role, Capability[]> = {
  super_admin: [
    "pricing.manage",
    "demo.configure",
    "users.manage",
    "content.import",
    "content.browse",
    "exam.build",
    "concept.configure",
    "scoring.override",
    "rewards.configure",
    "robuxRules.configure",
    "redemption.fulfill",
    "profile.export",
    "profile.import",
    "billing.subscribe",
    "reports.viewAll",
  ],
  admin: [
    "users.manage",
    "content.browse",
    "exam.build",
    "concept.configure",
    "scoring.override",
    "rewards.configure",
    "robuxRules.configure",
    "redemption.fulfill",
    "profile.export",
    "profile.import",
    "billing.subscribe",
    "reports.viewAll",
  ],
  // §8: parent/admin one-click override of a written-response score.
  parent: ["reports.viewChild", "payment.make", "progress.viewOwn", "scoring.override"],
  student: ["learn.do", "progress.viewOwn", "redemption.request", "workAhead"],
};

export function capabilitiesFor(roles: Role[]): Set<Capability> {
  const caps = new Set<Capability>();
  for (const role of roles) for (const cap of ROLE_CAPS[role]) caps.add(cap);
  return caps;
}

export function can(roles: Role[], capability: Capability): boolean {
  return capabilitiesFor(roles).has(capability);
}

export class ForbiddenError extends Error {
  constructor(capability: Capability) {
    super(`Forbidden: missing capability "${capability}"`);
    this.name = "ForbiddenError";
  }
}

/** Throwing guard for use at the top of a server function. */
export function requireCapability(roles: Role[], capability: Capability): void {
  if (!can(roles, capability)) throw new ForbiddenError(capability);
}
