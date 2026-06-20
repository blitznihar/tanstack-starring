import { COLLECTIONS, getCollection } from "./db.js";
import type { Plan } from "~/schemas/billing.js";

type PlanDoc = Plan & { _id: string };

async function col() {
  const c = await getCollection<PlanDoc>(COLLECTIONS.plans);
  await c.createIndex({ sortOrder: 1 });
  return c;
}

export const plansRepo = {
  /** Active plans, in display order. */
  async list(): Promise<PlanDoc[]> {
    return (await col()).find({ active: true }).sort({ sortOrder: 1 }).toArray();
  },

  async listAll(): Promise<PlanDoc[]> {
    return (await col()).find().sort({ sortOrder: 1 }).toArray();
  },

  async findById(id: string): Promise<PlanDoc | null> {
    return (await col()).findOne({ _id: id });
  },

  /** Upsert by slug id (idempotent seed). */
  async upsert(plan: Plan): Promise<void> {
    await (await col()).updateOne({ _id: plan.id }, { $set: { ...plan, _id: plan.id } }, { upsert: true });
  },

  async setPrice(id: string, priceCents: number): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { priceCents } });
  },
};
