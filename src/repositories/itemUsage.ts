import { COLLECTIONS, getCollection } from "./db.js";

/**
 * itemUsage drives no-repeat selection (§5): a problem is never shown to the same
 * student more than once. Recorded per enrollment.
 */
export type ItemUsage = {
  enrollmentId: string;
  itemId: string;
  usedAt: Date;
  context: "practice" | "exam";
};

async function col() {
  const c = await getCollection<ItemUsage>(COLLECTIONS.itemUsage);
  await c.createIndex({ enrollmentId: 1, itemId: 1 }, { unique: true });
  await c.createIndex({ enrollmentId: 1 });
  return c;
}

export const itemUsageRepo = {
  async usedItemIds(enrollmentId: string): Promise<Set<string>> {
    const docs = await (await col()).find({ enrollmentId }, { projection: { itemId: 1 } }).toArray();
    return new Set(docs.map((d) => d.itemId));
  },

  async record(enrollmentId: string, itemId: string, context: ItemUsage["context"]): Promise<void> {
    await (await col()).updateOne(
      { enrollmentId, itemId },
      { $setOnInsert: { enrollmentId, itemId, context, usedAt: new Date() } },
      { upsert: true },
    );
  },

  async recordMany(enrollmentId: string, itemIds: string[], context: ItemUsage["context"]): Promise<void> {
    await Promise.all(itemIds.map((id) => this.record(enrollmentId, id, context)));
  },

  async countForItem(itemId: string): Promise<number> {
    return (await col()).countDocuments({ itemId });
  },

  /** Aggregate usage counts (across all enrollments) for a set of items — one query. */
  async usageCounts(itemIds: string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const rows = await (await col())
      .aggregate<{ _id: string; count: number }>([
        { $match: { itemId: { $in: itemIds } } },
        { $group: { _id: "$itemId", count: { $sum: 1 } } },
      ])
      .toArray();
    const map = new Map<string, number>();
    for (const r of rows) map.set(r._id, r.count);
    return map;
  },
};
