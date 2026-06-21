import { COLLECTIONS, getCollection } from "./db.js";

export type PracticeProgressDoc = {
  _id: string;
  enrollmentId: string;
  programKey: string;
  subject: string;
  standardCode: string;
  completedAt: Date;
  updatedAt: Date;
};

async function col() {
  const c = await getCollection<PracticeProgressDoc>(COLLECTIONS.practiceProgress);
  await c.createIndex({ enrollmentId: 1, subject: 1, standardCode: 1 }, { unique: true });
  return c;
}

export const practiceProgressRepo = {
  async complete(input: {
    enrollmentId: string;
    programKey: string;
    subject: string;
    standardCode: string;
  }): Promise<void> {
    const now = new Date();
    await (await col()).updateOne(
      { enrollmentId: input.enrollmentId, subject: input.subject, standardCode: input.standardCode },
      {
        $set: { ...input, updatedAt: now },
        $setOnInsert: { _id: `${input.enrollmentId}:${input.subject}:${input.standardCode}`, completedAt: now },
      },
      { upsert: true },
    );
  },

  async isComplete(enrollmentId: string, subject: string, standardCode: string): Promise<boolean> {
    return !!(await (await col()).findOne({ enrollmentId, subject, standardCode }));
  },

  async undo(enrollmentId: string, subject: string, standardCode: string): Promise<boolean> {
    const result = await (await col()).deleteOne({ enrollmentId, subject, standardCode });
    return result.deletedCount > 0;
  },
};
