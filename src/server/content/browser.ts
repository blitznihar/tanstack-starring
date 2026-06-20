import { contentRepo } from "~/repositories/content.js";
import { programsRepo } from "~/repositories/programs.js";
import { itemUsageRepo } from "~/repositories/itemUsage.js";
import { requireCapability } from "~/server/auth/rbac.js";
import type { AuthContext } from "~/server/auth/session.js";
import type { Item, ItemType } from "~/schemas/item.js";
import type { Difficulty } from "~/schemas/common.js";

/**
 * Content browser (§5, §20.1). The Content area lists PROGRAMS at the top level;
 * every bundle gets a "View N items" entry. Admin/super_admin can open any bundle
 * and view every item, filterable by subject / topic (TEKS) / type / difficulty,
 * with a usage count per item.
 */

export type BundleListing = {
  bundleId: string;
  subject: string;
  version: number;
  status: string;
  title: string;
  itemCount: number;
  viewLabel: string; // "View 48 items"
};

export type ProgramContent = {
  programKey: string;
  programTitle: string;
  category: string;
  bundles: BundleListing[];
};

/** Top-level: programs, each with its bundles. SAT is its own program (not nested). */
export async function listContentByProgram(actor: AuthContext): Promise<ProgramContent[]> {
  requireCapability(actor.roles, "content.browse");
  const [programs, bundles] = await Promise.all([programsRepo.list(), contentRepo.listBundles()]);
  return programs.map((program) => ({
    programKey: program.key,
    programTitle: program.title,
    category: program.category,
    bundles: bundles
      .filter((b) => b.programKey === program.key)
      .map((b) => ({
        bundleId: String(b._id),
        subject: b.subject,
        version: b.version,
        status: b.status,
        title: b.title,
        itemCount: b.itemCount,
        viewLabel: `View ${b.itemCount} items`,
      })),
  }));
}

export type ItemFilters = {
  subject?: string;
  standardCode?: string; // topic / TEKS
  type?: ItemType;
  difficulty?: Difficulty;
};

export type BrowserItem = Item & { usageCount: number };

/** All items in a bundle, filtered, each with a usage count. */
export async function viewBundleItems(
  actor: AuthContext,
  bundleId: string,
  filters: ItemFilters = {},
): Promise<BrowserItem[]> {
  requireCapability(actor.roles, "content.browse");
  let items = await contentRepo.listItems({ bundleId });
  if (filters.subject) items = items.filter((i) => i.subject === filters.subject);
  if (filters.standardCode) items = items.filter((i) => i.standardCodes.includes(filters.standardCode!));
  if (filters.type) items = items.filter((i) => i.type === filters.type);
  if (filters.difficulty) items = items.filter((i) => i.difficulty === filters.difficulty);

  const counts = await itemUsageRepo.usageCounts(items.map((i) => i._id));
  return items.map((i) => ({ ...i, usageCount: counts.get(i._id) ?? 0 }));
}
