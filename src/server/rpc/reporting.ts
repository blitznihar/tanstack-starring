import { createServerFn } from "@tanstack/react-start";
import { usersRepo } from "~/repositories/users.js";
import { studentOverview } from "~/server/reporting/reporting.js";
import { requireAuth } from "./context.js";

/**
 * Parent/admin oversight: progress per program + overall rollup for a student.
 * For the demo there is one student (Maya); a real deployment would pass a childId.
 */
export const childOverview = createServerFn({ method: "GET" })
  .validator((d?: { studentId?: string }) => ({ studentId: d?.studentId }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    let studentId = data.studentId;
    if (!studentId) {
      const student = await usersRepo.findByRole("student");
      if (!student?._id) return { available: false as const };
      studentId = student._id;
      const overview = await studentOverview(auth, studentId);
      return { available: true as const, studentName: student.displayName, ...overview };
    }
    const overview = await studentOverview(auth, studentId);
    return { available: true as const, studentName: "", ...overview };
  });
