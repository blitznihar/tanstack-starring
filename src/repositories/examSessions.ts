import { COLLECTIONS, getCollection } from "./db.js";
import type { ExamSessionState } from "~/domain/exam/session.js";

/** A live exam attempt (§4 examSessions). The pure state machine lives in domain. */
export type ExamSessionDoc = ExamSessionState & {
  _id: string;
  studentId: string;
  result?: unknown; // ExamResult-derived payload, set on submit
  createdAt: Date;
  updatedAt: Date;
};

async function col() {
  const c = await getCollection<ExamSessionDoc>(COLLECTIONS.examSessions);
  await c.createIndex({ studentId: 1, updatedAt: -1 });
  await c.createIndex({ enrollmentId: 1 });
  return c;
}

export const examSessionsRepo = {
  async insert(doc: ExamSessionDoc): Promise<void> {
    await (await col()).insertOne(doc);
  },
  async findById(id: string): Promise<ExamSessionDoc | null> {
    return (await col()).findOne({ _id: id });
  },
  async listSubmitted(enrollmentId: string): Promise<ExamSessionDoc[]> {
    return (await col()).find({ enrollmentId, status: "submitted" }).sort({ updatedAt: -1 }).toArray();
  },
  /** Persist the mutated state machine (everything except identity/createdAt). */
  async save(id: string, state: ExamSessionState): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { ...state, updatedAt: new Date() } });
  },
  async saveResult(id: string, result: unknown): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { result, updatedAt: new Date() } });
  },
};
