import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";

/**
 * A recorded answer to an item (§4 responses). For practice this also enforces
 * one-attempt-per-item idempotency (re-checking must not re-award — §20.6).
 */
export type ResponseDoc = {
  _id: string;
  enrollmentId: string;
  itemId: string;
  context: "practice" | "exam";
  examSessionId?: string;
  selected: unknown;
  correct: boolean;
  earned: number;
  awarded: number; // Robux awarded for this response
  at: Date;
};

async function col() {
  const c = await getCollection<ResponseDoc>(COLLECTIONS.responses);
  await c.createIndex({ enrollmentId: 1, context: 1 });
  // One practice response per (enrollment, item): drives idempotent awarding.
  await c.createIndex(
    { enrollmentId: 1, itemId: 1, context: 1 },
    { unique: true, partialFilterExpression: { context: "practice" } },
  );
  return c;
}

export const responsesRepo = {
  async findPractice(enrollmentId: string, itemId: string): Promise<ResponseDoc | null> {
    return (await col()).findOne({ enrollmentId, itemId, context: "practice" });
  },

  async listPractice(enrollmentId: string): Promise<ResponseDoc[]> {
    return (await col()).find({ enrollmentId, context: "practice" }).toArray();
  },

  async deletePracticeByItemIds(enrollmentId: string, itemIds: string[]): Promise<number> {
    const ids = [...new Set(itemIds.map(String).filter(Boolean))];
    if (ids.length === 0) return 0;
    const result = await (await col()).deleteMany({ enrollmentId, context: "practice", itemId: { $in: ids } });
    return result.deletedCount;
  },

  /** Insert; returns null if a practice response for this item already exists. */
  async insertPractice(doc: Omit<ResponseDoc, "_id" | "at" | "context">): Promise<ResponseDoc | null> {
    const full: ResponseDoc = { ...doc, _id: randomUUID(), context: "practice", at: new Date() };
    try {
      await (await col()).insertOne(full);
      return full;
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: number }).code === 11000) return null;
      throw e;
    }
  },
};
