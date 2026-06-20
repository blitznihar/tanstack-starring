import { COLLECTIONS, getCollection } from "./db.js";
import type { Schedule } from "~/domain/scheduler/scheduler.js";

export type ScheduleDoc = Schedule & { _id: string; enrollmentId: string; updatedAt: Date };

async function col() {
  const c = await getCollection<ScheduleDoc>(COLLECTIONS.schedules);
  await c.createIndex({ enrollmentId: 1 }, { unique: true });
  return c;
}

export const schedulesRepo = {
  async find(enrollmentId: string): Promise<ScheduleDoc | null> {
    return (await col()).findOne({ enrollmentId });
  },
  async save(enrollmentId: string, schedule: Schedule): Promise<void> {
    await (await col()).updateOne(
      { enrollmentId },
      { $set: { ...schedule, enrollmentId, updatedAt: new Date() }, $setOnInsert: { _id: enrollmentId } },
      { upsert: true },
    );
  },
};
