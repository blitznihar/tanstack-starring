import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";

export type RedemptionStatus = "requested" | "approved" | "fulfilled" | "denied";
export type RedemptionEvent = { at: Date; action: string; amount?: number; by?: string };

export type RedemptionDoc = {
  _id: string;
  enrollmentId: string;
  item: string;
  amountRequested: number;
  amountFulfilled: number;
  status: RedemptionStatus;
  history: RedemptionEvent[];
  createdAt: Date;
  updatedAt: Date;
};

async function col() {
  const c = await getCollection<RedemptionDoc>(COLLECTIONS.redemptions);
  await c.createIndex({ enrollmentId: 1, createdAt: -1 });
  return c;
}

export const redemptionsRepo = {
  async list(enrollmentId: string): Promise<RedemptionDoc[]> {
    return (await col()).find({ enrollmentId }).sort({ createdAt: -1 }).toArray();
  },
  async listAll(statuses?: RedemptionStatus[]): Promise<RedemptionDoc[]> {
    const filter = statuses ? { status: { $in: statuses } } : {};
    return (await col()).find(filter).sort({ createdAt: -1 }).toArray();
  },
  async findById(id: string): Promise<RedemptionDoc | null> {
    return (await col()).findOne({ _id: id });
  },
  async insert(doc: Omit<RedemptionDoc, "_id" | "createdAt" | "updatedAt">): Promise<RedemptionDoc> {
    const now = new Date();
    const full: RedemptionDoc = { ...doc, _id: randomUUID(), createdAt: now, updatedAt: now };
    await (await col()).insertOne(full);
    return full;
  },
  async update(id: string, patch: Partial<RedemptionDoc>): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
  },
};
