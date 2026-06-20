import { contentRepo } from "~/repositories/content.js";
import { itemUsageRepo } from "~/repositories/itemUsage.js";
import { requireCapability } from "~/server/auth/rbac.js";
import {
  groupIntoPools,
  lowOrExhaustedPools,
  DEFAULT_THRESHOLDS,
  type Pool,
  type PoolThresholds,
} from "~/domain/pools/pools.js";
import type { AuthContext } from "~/server/auth/session.js";

export type PoolView = Pool & { conceptName: string };

async function conceptNames(programKey: string, subject: string): Promise<Map<string, string>> {
  const standards = await contentRepo.listStandards(programKey, subject);
  const map = new Map<string, string>();
  for (const s of standards) map.set(s.code, s.description);
  return map;
}

/**
 * Compute pool status for a (program, subject). Pass `enrollmentId` for a
 * per-student no-repeat view; omit for the global admin/content-browser view.
 */
export async function poolStatuses(
  actor: AuthContext,
  programKey: string,
  subject: string,
  opts?: { enrollmentId?: string; thresholds?: PoolThresholds },
): Promise<PoolView[]> {
  requireCapability(actor.roles, "content.browse");
  const items = await contentRepo.listItems({ programKey, subject });
  const usedIds = opts?.enrollmentId
    ? await itemUsageRepo.usedItemIds(opts.enrollmentId)
    : new Set<string>();
  const names = await conceptNames(programKey, subject);
  const pools = groupIntoPools(items, usedIds, { thresholds: opts?.thresholds ?? DEFAULT_THRESHOLDS });
  return pools.map((p) => ({ ...p, conceptName: names.get(p.standardCode) ?? p.standardCode }));
}

/** Low/exhausted pools for a (program, subject) — the deficit set for refill. */
export async function deficitPools(
  actor: AuthContext,
  programKey: string,
  subject: string,
  opts?: { enrollmentId?: string; thresholds?: PoolThresholds },
): Promise<PoolView[]> {
  const all = await poolStatuses(actor, programKey, subject, opts);
  return lowOrExhaustedPools(all) as PoolView[];
}
