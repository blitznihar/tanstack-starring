import { COLLECTIONS, getCollection } from "./db.js";
import type { Enrollment } from "~/schemas/enrollment.js";

type EnrollmentDoc = Enrollment & { _id?: string };

async function col() {
  const c = await getCollection<EnrollmentDoc>(COLLECTIONS.enrollments);
  await c.createIndex({ studentId: 1, programKey: 1 }, { unique: true });
  return c;
}

export const enrollmentsRepo = {
  async findById(id: string): Promise<EnrollmentDoc | null> {
    return (await col()).findOne({ _id: id });
  },

  async listForStudent(studentId: string): Promise<EnrollmentDoc[]> {
    return (await col()).find({ studentId }).toArray();
  },

  async find(studentId: string, programKey: string): Promise<EnrollmentDoc | null> {
    return (await col()).findOne({ studentId, programKey });
  },

  async upsert(enrollment: Enrollment): Promise<void> {
    const now = new Date();
    // Never $set the immutable _id — assign it only on insert.
    const { _id, ...rest } = enrollment;
    await (await col()).updateOne(
      { studentId: enrollment.studentId, programKey: enrollment.programKey },
      { $set: { ...rest, updatedAt: now }, $setOnInsert: { createdAt: now, ...(_id ? { _id } : {}) } },
      { upsert: true },
    );
  },

  async setStatus(id: string, status: Enrollment["status"]): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });
  },

  async setStatusForStudentProgram(studentId: string, programKey: string, status: Enrollment["status"]): Promise<void> {
    await (await col()).updateOne({ studentId, programKey }, { $set: { status, updatedAt: new Date() } });
  },
};
