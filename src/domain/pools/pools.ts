import type { Item, ItemType } from "~/schemas/item.js";
import type { Difficulty } from "~/schemas/common.js";

/**
 * Item pools & no-repeat selection (§5).
 *
 * A pool = items for a given (programKey, subject, standardCode[, type, difficulty]).
 * `itemUsage` (per enrollment) drives no-repeat: a problem is never shown to the
 * same student twice. Per pool we compute the unused count and a depletion status
 * — ok / running_low / exhausted — using configurable thresholds.
 */

export type PoolStatus = "ok" | "running_low" | "exhausted";

export type PoolThresholds = {
  /** Per-concept target depth (§6: ≥30 problems per concept). Drives the refill "need" count. */
  target: number;
  /** Unused count at/below which a non-empty pool is "running_low". */
  lowThreshold: number;
};

export const DEFAULT_THRESHOLDS: PoolThresholds = { target: 30, lowThreshold: 2 };

export type Pool = {
  /** Canonical key for the pool grouping. */
  key: string;
  programKey: string;
  subject: string;
  standardCode: string;
  type?: ItemType;
  difficulty?: Difficulty;
  total: number;
  used: number;
  unused: number;
  status: PoolStatus;
  /** How many fresh items to author to reach `target` unused (0 when already met). */
  need: number;
  /** Item ids in this pool (stems available via the caller). */
  itemIds: string[];
};

export type PoolGranularity = "standard" | "standard_type" | "standard_type_difficulty";

function poolKey(
  item: Pick<Item, "programKey" | "subject" | "standardCodes" | "type" | "difficulty">,
  standardCode: string,
  granularity: PoolGranularity,
): string {
  const parts = [item.programKey, item.subject, standardCode];
  if (granularity !== "standard") parts.push(item.type);
  if (granularity === "standard_type_difficulty") parts.push(item.difficulty);
  return parts.join("|");
}

export function statusFor(unused: number, thresholds: PoolThresholds): PoolStatus {
  if (unused <= 0) return "exhausted";
  if (unused <= thresholds.lowThreshold) return "running_low";
  return "ok";
}

/**
 * Group items into pools and compute per-pool status against a set of used item
 * ids. Pass an empty `usedIds` set for a global (admin browser) view, or an
 * enrollment's used ids for a per-student view.
 */
export function groupIntoPools(
  items: Item[],
  usedIds: Set<string>,
  opts?: { granularity?: PoolGranularity; thresholds?: PoolThresholds },
): Pool[] {
  const granularity = opts?.granularity ?? "standard";
  const thresholds = opts?.thresholds ?? DEFAULT_THRESHOLDS;
  const map = new Map<string, Pool>();

  for (const item of items) {
    // An item tagged with multiple standards belongs to each of its standards' pools.
    for (const code of item.standardCodes) {
      const key = poolKey(item, code, granularity);
      let pool = map.get(key);
      if (!pool) {
        pool = {
          key,
          programKey: item.programKey,
          subject: item.subject,
          standardCode: code,
          ...(granularity !== "standard" ? { type: item.type } : {}),
          ...(granularity === "standard_type_difficulty" ? { difficulty: item.difficulty } : {}),
          total: 0,
          used: 0,
          unused: 0,
          status: "exhausted",
          need: 0,
          itemIds: [],
        };
        map.set(key, pool);
      }
      pool.total += 1;
      pool.itemIds.push(item._id);
      if (usedIds.has(item._id)) pool.used += 1;
      else pool.unused += 1;
    }
  }

  for (const pool of map.values()) {
    pool.status = statusFor(pool.unused, thresholds);
    pool.need = Math.max(0, thresholds.target - pool.unused);
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * No-repeat selection: pick up to `count` unused items from `items`, given the
 * student's used ids. Stable order (preserves input order) for deterministic
 * day-to-day practice assembly.
 */
export function selectUnused(items: Item[], usedIds: Set<string>, count: number): Item[] {
  const out: Item[] = [];
  for (const item of items) {
    if (out.length >= count) break;
    if (!usedIds.has(item._id)) out.push(item);
  }
  return out;
}

/** Pools at or below the running_low line — the deficit set the refill prompt targets. */
export function lowOrExhaustedPools(pools: Pool[]): Pool[] {
  return pools.filter((p) => p.status !== "ok");
}
