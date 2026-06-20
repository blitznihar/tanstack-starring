import { createServerFn } from "@tanstack/react-start";
import { studentOverview } from "~/server/reporting/reporting.js";
import { assertCanSeeStudent, publicUserOption, userId, visibleStudentsFor } from "~/server/users/associations.js";
import { requireAuth } from "./context.js";

async function summariesForStudents(
  auth: Awaited<ReturnType<typeof requireAuth>>,
  students: Awaited<ReturnType<typeof visibleStudentsFor>>,
  selectedStudentId?: string,
  selectedOverview?: Awaited<ReturnType<typeof studentOverview>>,
) {
  return Promise.all(
    students.map(async (entry) => {
      const id = userId(entry);
      const summary = id === selectedStudentId && selectedOverview ? selectedOverview : await studentOverview(auth, id);
      return {
        id,
        displayName: entry.displayName,
        topicsCompleted: summary.overall.topicsCompleted,
        topicsTotal: summary.overall.topicsTotal,
        availableRobux: summary.overall.availableRobux,
        programCount: summary.perProgram.length,
      };
    }),
  );
}

/**
 * Parent/admin oversight: progress per program + overall rollup for a student.
 */
export const childOverview = createServerFn({ method: "GET" })
  .validator((d?: { studentId?: string; autoSelect?: boolean }) => ({
    studentId: d?.studentId,
    autoSelect: d?.autoSelect ?? true,
  }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const students = await visibleStudentsFor(auth);
    const selector = students.map(publicUserOption);
    const studentId = data.studentId || (data.autoSelect && students[0] ? userId(students[0]) : "");
    if (!studentId) {
      return {
        available: false as const,
        students: selector,
        studentSummaries: await summariesForStudents(auth, students),
      };
    }
    await assertCanSeeStudent(auth, studentId);
    const student = students.find((entry) => userId(entry) === studentId);
    const overview = await studentOverview(auth, studentId);
    const studentSummaries = await summariesForStudents(auth, students, studentId, overview);
    return {
      available: true as const,
      students: selector,
      studentSummaries,
      studentId,
      studentName: student?.displayName ?? "Student",
      ...overview,
    };
  });
