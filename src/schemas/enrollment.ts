import { z } from "zod";
import { dateStringSchema } from "./common.js";

/**
 * Enrollment — a student in a program. All student-facing features key off an
 * enrollment, never off a bare student. One student may hold multiple active
 * enrollments, each with its own schedule/mastery/ledger/streak.
 */
export const enrollmentStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

export const enrollmentSchema = z.object({
  _id: z.string().optional(),
  studentId: z.string().min(1),
  programKey: z.string().min(1),
  startDate: dateStringSchema,
  targetDays: z.number().int().positive(),
  status: enrollmentStatusSchema.default("active"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type Enrollment = z.infer<typeof enrollmentSchema>;
