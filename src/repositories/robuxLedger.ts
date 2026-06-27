import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";
import type { LedgerEntryType } from "~/domain/ledger/ledger.js";

/** Robux ledger entry — per enrollment (§11). */
export type RobuxLedgerDoc = {
  _id: string;
  enrollmentId: string;
  type: LedgerEntryType; // earn | penalty | redeem_fulfilled
  amount: number; // positive magnitude
  source: string; // "practice" | "exam" | "redemption" | ...
  refId?: string; // e.g. itemId / examSessionId — used for idempotency
  reason?: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  at: Date;
};

async function col() {
  const c = await getCollection<RobuxLedgerDoc>(COLLECTIONS.robuxLedger);
  await c.createIndex({ enrollmentId: 1, at: -1 });
  // Idempotency guard: at most one entry per (enrollment, source, refId).
  await c.createIndex(
    { enrollmentId: 1, source: 1, refId: 1 },
    { unique: true, partialFilterExpression: { refId: { $exists: true } } },
  );
  return c;
}

export const robuxLedgerRepo = {
  async list(enrollmentId: string): Promise<RobuxLedgerDoc[]> {
    return (await col()).find({ enrollmentId }).sort({ at: -1 }).toArray();
  },

  /**
   * Append an entry. When `refId` is set the unique index makes this idempotent —
   * a duplicate (enrollment, source, refId) is swallowed and returns false.
   */
  async add(entry: Omit<RobuxLedgerDoc, "_id" | "at">): Promise<boolean> {
    try {
      await (await col()).insertOne({ ...entry, _id: randomUUID(), at: new Date() });
      return true;
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: number }).code === 11000) return false;
      throw e;
    }
  },

  async deleteByRefs(enrollmentId: string, source: string, refIds: string[]): Promise<number> {
    const ids = [...new Set(refIds.map(String).filter(Boolean))];
    if (ids.length === 0) return 0;
    const result = await (await col()).deleteMany({ enrollmentId, source, refId: { $in: ids } });
    return result.deletedCount;
  },
};
