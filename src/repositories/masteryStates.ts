import { COLLECTIONS, getCollection } from "./db.js";
import type { MasteryState } from "~/domain/mastery/mastery.js";

export type MasteryDoc = MasteryState & { enrollmentId: string; updatedAt: Date };

async function col() {
  const c = await getCollection<MasteryDoc>(COLLECTIONS.masteryStates);
  await c.createIndex({ enrollmentId: 1, standardCode: 1 }, { unique: true });
  return c;
}

export const masteryRepo = {
  async list(enrollmentId: string): Promise<MasteryDoc[]> {
    return (await col()).find({ enrollmentId }).toArray();
  },
  async get(enrollmentId: string, standardCode: string): Promise<MasteryDoc | null> {
    return (await col()).findOne({ enrollmentId, standardCode });
  },
  async save(enrollmentId: string, state: MasteryState): Promise<void> {
    await (await col()).updateOne(
      { enrollmentId, standardCode: state.standardCode },
      { $set: { ...state, enrollmentId, updatedAt: new Date() } },
      { upsert: true },
    );
  },
};
