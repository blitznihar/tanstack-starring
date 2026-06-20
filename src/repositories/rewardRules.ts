import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";
import type { RewardRule } from "~/domain/rewards/rewards.js";

export type RewardRuleDoc = RewardRule & { createdAt: Date; updatedAt: Date };

async function col() {
  const c = await getCollection<RewardRuleDoc>(COLLECTIONS.rewardRules);
  await c.createIndex({ programKey: 1 });
  return c;
}

export const rewardRulesRepo = {
  async listForProgram(programKey: string, studentId?: string): Promise<RewardRuleDoc[]> {
    const filter: Record<string, unknown> = { programKey };
    // Program-wide rules (no studentId) + this student's rules.
    if (studentId) filter.$or = [{ studentId: { $exists: false } }, { studentId }];
    return (await col()).find(filter).toArray();
  },
  async list(): Promise<RewardRuleDoc[]> {
    return (await col()).find().toArray();
  },
  async upsert(rule: Omit<RewardRule, "id"> & { id?: string }): Promise<RewardRuleDoc> {
    const id = rule.id ?? randomUUID();
    const now = new Date();
    await (await col()).updateOne(
      { id },
      { $set: { ...rule, id, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return (await (await col()).findOne({ id }))!;
  },
  async setStatus(id: string, status: RewardRule["status"]): Promise<void> {
    await (await col()).updateOne({ id }, { $set: { status, updatedAt: new Date() } });
  },
};
