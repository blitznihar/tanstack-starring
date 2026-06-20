import { COLLECTIONS, getCollection } from "./db.js";
import type { Passage } from "~/schemas/passage.js";

type PassageDoc = Passage & { _id: string };

async function col() {
  const c = await getCollection<PassageDoc>(COLLECTIONS.passages);
  await c.createIndex({ bundleId: 1 });
  await c.createIndex({ programKey: 1, subject: 1 });
  return c;
}

export const passagesRepo = {
  /** Single-upload semantics: re-importing a bundle replaces its passages. */
  async replaceBundlePassages(bundleId: string, passages: PassageDoc[]): Promise<void> {
    const c = await col();
    await c.deleteMany({ bundleId });
    if (passages.length > 0) await c.insertMany(passages);
  },

  async findById(id: string): Promise<PassageDoc | null> {
    return (await col()).findOne({ _id: id });
  },

  /** Resolve a passage by its bundle-local `id` within a program/subject. */
  async findByRef(programKey: string, subject: string, ref: string): Promise<PassageDoc | null> {
    return (await col()).findOne({ programKey, subject, id: ref });
  },

  async list(programKey: string, subject?: string): Promise<PassageDoc[]> {
    const filter: Record<string, unknown> = { programKey };
    if (subject) filter.subject = subject;
    return (await col()).find(filter).toArray();
  },
};
