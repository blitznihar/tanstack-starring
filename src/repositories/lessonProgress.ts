import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";

export type LessonProgressDoc = {
  _id: string;
  enrollmentId: string;
  programKey: string;
  subject: string;
  standardCode: string;
  completedAt: Date;
  updatedAt: Date;
};

async function col() {
  const c = await getCollection<LessonProgressDoc>(COLLECTIONS.lessonProgress);
  await c.createIndex({ enrollmentId: 1, subject: 1, standardCode: 1 }, { unique: true });
  await c.createIndex({ enrollmentId: 1, completedAt: -1 });
  return c;
}

export const lessonProgressRepo = {
  async complete(input: {
    enrollmentId: string;
    programKey: string;
    subject: string;
    standardCode: string;
  }): Promise<LessonProgressDoc> {
    const now = new Date();
    const _id = `${input.enrollmentId}:${input.subject}:${input.standardCode}`;
    await (await col()).updateOne(
      { enrollmentId: input.enrollmentId, subject: input.subject, standardCode: input.standardCode },
      {
        $set: { ...input, updatedAt: now },
        $setOnInsert: { _id, completedAt: now },
      },
      { upsert: true },
    );
    return (await (await col()).findOne({ _id })) ?? { _id: randomUUID(), ...input, completedAt: now, updatedAt: now };
  },

  async isComplete(enrollmentId: string, subject: string, standardCode: string): Promise<boolean> {
    return !!(await (await col()).findOne({ enrollmentId, subject, standardCode }));
  },

  async completedCodes(enrollmentId: string, subject?: string): Promise<string[]> {
    const filter: Record<string, unknown> = { enrollmentId };
    if (subject) filter.subject = subject;
    const rows = await (await col()).find(filter).sort({ completedAt: 1 }).toArray();
    return [...new Set(rows.map((row) => row.standardCode))];
  },

  async listForEnrollment(enrollmentId: string): Promise<LessonProgressDoc[]> {
    return (await col()).find({ enrollmentId }).sort({ subject: 1, standardCode: 1 }).toArray();
  },

  async completedToday(enrollmentId: string): Promise<LessonProgressDoc[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return (await col())
      .find({ enrollmentId, completedAt: { $gte: start, $lt: end } })
      .sort({ completedAt: 1 })
      .toArray();
  },

  async undo(enrollmentId: string, subject: string, standardCode: string): Promise<boolean> {
    const result = await (await col()).deleteOne({ enrollmentId, subject, standardCode });
    return result.deletedCount > 0;
  },
};
