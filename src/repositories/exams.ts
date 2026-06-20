import { COLLECTIONS, getCollection } from "./db.js";
import type { ExamKind } from "~/domain/exam/assemble.js";

/** Assembled exam definition (§4 exams). */
export type ExamDoc = {
  _id: string;
  enrollmentId: string;
  kind: ExamKind;
  sections: { subject: string; itemIds: string[]; seconds: number }[];
  itemIds: string[];
  durationSeconds: number;
  breakSeconds: number;
  splitPct: Record<string, number>;
  coverage: string[];
  createdAt: Date;
};

async function col() {
  const c = await getCollection<ExamDoc>(COLLECTIONS.exams);
  await c.createIndex({ enrollmentId: 1, createdAt: -1 });
  return c;
}

export const examsRepo = {
  async insert(doc: ExamDoc): Promise<void> {
    await (await col()).insertOne(doc);
  },
  async findById(id: string): Promise<ExamDoc | null> {
    return (await col()).findOne({ _id: id });
  },
};
