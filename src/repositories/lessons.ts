import { COLLECTIONS, getCollection } from "./db.js";
import type { LessonDoc } from "~/schemas/lesson.js";

async function lessonsCol() {
  const c = await getCollection<LessonDoc>(COLLECTIONS.lessons);
  await c.createIndex({ programKey: 1, subject: 1, standardCode: 1, version: -1 });
  await c.createIndex({ programKey: 1, subject: 1, status: 1 });
  return c;
}

export const lessonsRepo = {
  async upsertMany(lessons: LessonDoc[]): Promise<void> {
    const c = await lessonsCol();
    if (lessons.length === 0) return;
    await c.bulkWrite(
      lessons.map((lesson) => {
        const { createdAt, ...settable } = lesson;
        return {
          updateOne: {
            filter: { _id: lesson._id },
            update: {
              $set: settable,
              $setOnInsert: { createdAt },
            },
            upsert: true,
          },
        };
      }),
    );
  },

  async list(programKey?: string): Promise<LessonDoc[]> {
    const filter = programKey ? { programKey } : {};
    return (await lessonsCol()).find(filter).sort({ programKey: 1, subject: 1, standardCode: 1, version: -1 }).toArray();
  },

  async findAvailable(programKey: string, subject: string, standardCode: string): Promise<LessonDoc | null> {
    return (await lessonsCol())
      .find({ programKey, subject, standardCode, status: "available" })
      .sort({ version: -1, updatedAt: -1 })
      .limit(1)
      .next();
  },
};
