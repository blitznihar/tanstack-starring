import { COLLECTIONS, getCollection } from "./db.js";
import type { Item } from "~/schemas/item.js";
import type { BundleDoc, Standard } from "~/schemas/contentBundle.js";

type ItemDoc = Item & { _id: string };
type BundleD = BundleDoc;
type StandardDoc = Standard & { _id?: string };

async function bundlesCol() {
  const c = await getCollection<BundleD>(COLLECTIONS.bundles);
  await c.createIndex({ programKey: 1, subject: 1, version: 1 }, { unique: true });
  return c;
}
async function itemsCol() {
  const c = await getCollection<ItemDoc>(COLLECTIONS.items);
  await c.createIndex({ bundleId: 1 });
  await c.createIndex({ programKey: 1, subject: 1 });
  await c.createIndex({ standardCodes: 1 });
  return c;
}
async function standardsCol() {
  const c = await getCollection<StandardDoc>(COLLECTIONS.standards);
  await c.createIndex({ code: 1, programKey: 1, subject: 1 }, { unique: true });
  return c;
}

export const contentRepo = {
  // ---- bundles ----
  async findBundle(programKey: string, subject: string, version: number): Promise<BundleD | null> {
    return (await bundlesCol()).findOne({ programKey, subject, version });
  },

  async listBundles(programKey?: string): Promise<BundleD[]> {
    const filter = programKey ? { programKey } : {};
    return (await bundlesCol()).find(filter).sort({ programKey: 1, subject: 1, version: -1 }).toArray();
  },

  async upsertBundle(bundle: BundleD): Promise<void> {
    await (await bundlesCol()).updateOne(
      { programKey: bundle.programKey, subject: bundle.subject, version: bundle.version },
      { $set: bundle },
      { upsert: true },
    );
  },

  async setBundleStatus(id: string, status: BundleD["status"]): Promise<void> {
    await (await bundlesCol()).updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });
  },

  // ---- items ----
  async replaceBundleItems(bundleId: string, items: ItemDoc[]): Promise<void> {
    const c = await itemsCol();
    // Single-upload semantics: re-importing a (program,subject,version) replaces its items.
    await c.deleteMany({ bundleId });
    if (items.length > 0) await c.insertMany(items);
  },

  async listItems(filter: Partial<Pick<Item, "programKey" | "subject" | "bundleId" | "type" | "difficulty">>): Promise<ItemDoc[]> {
    return (await itemsCol()).find(filter as Record<string, unknown>).toArray();
  },

  async listItemsByStandard(programKey: string, subject: string, standardCode: string): Promise<ItemDoc[]> {
    return (await itemsCol()).find({ programKey, subject, standardCodes: standardCode }).toArray();
  },

  async findItem(id: string): Promise<ItemDoc | null> {
    return (await itemsCol()).findOne({ _id: id });
  },

  async countItems(bundleId: string): Promise<number> {
    return (await itemsCol()).countDocuments({ bundleId });
  },

  // ---- standards ----
  async upsertStandard(standard: Standard): Promise<void> {
    await (await standardsCol()).updateOne(
      { code: standard.code, programKey: standard.programKey, subject: standard.subject },
      { $set: standard },
      { upsert: true },
    );
  },

  async listStandards(programKey: string, subject?: string): Promise<StandardDoc[]> {
    const filter: Record<string, unknown> = { programKey };
    if (subject) filter.subject = subject;
    return (await standardsCol()).find(filter).toArray();
  },
};
