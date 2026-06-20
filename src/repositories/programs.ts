import { COLLECTIONS, getCollection } from "./db.js";
import type { Program } from "~/schemas/program.js";

type ProgramDoc = Program & { _id?: string };

async function col() {
  const c = await getCollection<ProgramDoc>(COLLECTIONS.programs);
  await c.createIndex({ key: 1 }, { unique: true });
  return c;
}

export const programsRepo = {
  async findByKey(key: string): Promise<ProgramDoc | null> {
    return (await col()).findOne({ key });
  },

  async list(): Promise<ProgramDoc[]> {
    return (await col()).find().sort({ key: 1 }).toArray();
  },

  async setRobuxRules(key: string, robuxRules: Program["robuxRules"]): Promise<void> {
    await (await col()).updateOne({ key }, { $set: { robuxRules, updatedAt: new Date() } });
  },

  async setConceptConfig(key: string, conceptConfig: Program["conceptConfig"]): Promise<void> {
    await (await col()).updateOne({ key }, { $set: { conceptConfig, updatedAt: new Date() } });
  },

  async setStatus(key: string, status: Program["status"]): Promise<void> {
    await (await col()).updateOne({ key }, { $set: { status, updatedAt: new Date() } });
  },

  /** Upsert by program key (idempotent seed/import). */
  async upsert(program: Program): Promise<void> {
    const now = new Date();
    await (await col()).updateOne(
      { key: program.key },
      {
        $set: { ...program, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  },
};
