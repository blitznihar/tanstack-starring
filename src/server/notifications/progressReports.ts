import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { responsesRepo } from "~/repositories/responses.js";
import { schedulesRepo } from "~/repositories/schedules.js";
import { usersRepo } from "~/repositories/users.js";
import { currentDayIndex, type Task } from "~/domain/scheduler/scheduler.js";
import { parentsForStudent, userId } from "~/server/users/associations.js";
import { queueEmailNotification } from "./email.js";

type ReportExamSummary = {
  title: string;
  correctCount: number;
  wrongCount: number;
  scorePct?: number;
  robuxNet?: number;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sameDay(value: Date | string | undefined, day: string): boolean {
  if (!value) return false;
  return new Date(value).toISOString().slice(0, 10) === day;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelTask(task: Task, standardTitles: Map<string, string>): string {
  const subject = task.subject ? task.subject.toUpperCase() : "";
  const topic = task.topic ? `TEKS ${task.topic}` : task.title;
  const title = task.topic ? standardTitles.get(task.topic) : "";
  return [subject, topic, title].filter(Boolean).join(" - ");
}

async function todaysLessons(enrollmentId: string): Promise<string[]> {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  if (!enrollment) return [];
  const [schedule, standards] = await Promise.all([
    schedulesRepo.find(enrollmentId),
    contentRepo.listStandards(enrollment.programKey),
  ]);
  if (!schedule) return [];
  const current = schedule.days[currentDayIndex(schedule)];
  if (!current) return [];
  const standardTitles = new Map(standards.map((standard) => [standard.code, standard.description ?? standard.code]));
  return current.tasks.filter((task) => task.kind === "lesson").map((task) => labelTask(task, standardTitles));
}

async function todaysPracticeSummary(enrollmentId: string): Promise<{ solved: number; right: number; wrong: number }> {
  const day = todayIso();
  const responses = await responsesRepo.listPractice(enrollmentId);
  const today = responses.filter((response) => sameDay(response.at, day));
  const right = today.filter((response) => response.correct).length;
  return { solved: today.length, right, wrong: today.length - right };
}

async function reportRecipients(studentId: string) {
  const [parents, users] = await Promise.all([parentsForStudent(studentId), usersRepo.list()]);
  const superAdmins = users.filter((user) => user.active && user.roles.includes("super_admin"));
  const byId = new Map([...parents, ...superAdmins].map((user) => [userId(user), user]));
  return [...byId.values()];
}

function reportBody(input: {
  studentName: string;
  programTitle: string;
  lessons: string[];
  practice: { solved: number; right: number; wrong: number };
  exam?: ReportExamSummary;
}): string {
  const lessons = input.lessons.length
    ? input.lessons.map((lesson) => `<li>${escapeHtml(lesson)}</li>`).join("")
    : "<li>No scheduled lesson was found today.</li>";
  const exam = input.exam
    ? `
      <h3 style="margin:20px 0 8px;color:#2f2943;">Exam</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border:1px solid #e4dced;">Exam</td><td style="padding:8px;border:1px solid #e4dced;"><strong>${escapeHtml(input.exam.title)}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e4dced;">Right / Wrong</td><td style="padding:8px;border:1px solid #e4dced;"><strong>${input.exam.correctCount}</strong> right, <strong>${input.exam.wrongCount}</strong> wrong</td></tr>
        ${input.exam.scorePct == null ? "" : `<tr><td style="padding:8px;border:1px solid #e4dced;">Score</td><td style="padding:8px;border:1px solid #e4dced;"><strong>${input.exam.scorePct}%</strong></td></tr>`}
        ${input.exam.robuxNet == null ? "" : `<tr><td style="padding:8px;border:1px solid #e4dced;">Robux</td><td style="padding:8px;border:1px solid #e4dced;"><strong>${input.exam.robuxNet}</strong></td></tr>`}
      </table>`
    : "";

  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:680px;color:#3a344d;">
      <h2 style="margin:0 0 6px;color:#2f2943;">Comet Academy Progress Report</h2>
      <p style="margin:0 0 18px;color:#746b88;">${escapeHtml(input.studentName)} - ${escapeHtml(input.programTitle)} - ${todayIso()}</p>

      <h3 style="margin:0 0 8px;color:#2f2943;">Lessons Finished Today</h3>
      <ul style="margin:0 0 18px;padding-left:20px;">${lessons}</ul>

      <h3 style="margin:0 0 8px;color:#2f2943;">Practice</h3>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px;border:1px solid #e4dced;">Questions solved</td>
          <td style="padding:8px;border:1px solid #e4dced;"><strong>${input.practice.solved}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e4dced;">Right vs wrong</td>
          <td style="padding:8px;border:1px solid #e4dced;"><strong>${input.practice.right}</strong> right, <strong>${input.practice.wrong}</strong> wrong</td>
        </tr>
      </table>
      ${exam}
    </div>`;
}

export async function queuePracticeProgressReport(enrollmentId: string): Promise<void> {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  if (!enrollment) return;
  const [student, program, lessons, practice, recipients] = await Promise.all([
    usersRepo.findById(enrollment.studentId),
    programsRepo.findByKey(enrollment.programKey),
    todaysLessons(enrollmentId),
    todaysPracticeSummary(enrollmentId),
    reportRecipients(enrollment.studentId),
  ]);
  if (!student || !program || recipients.length === 0) return;
  const body = reportBody({ studentName: student.displayName, programTitle: program.title, lessons, practice });
  await Promise.all(recipients.map((recipient) => queueEmailNotification({
    userId: userId(recipient),
    kind: "practice_report",
    subject: `Practice report for ${student.displayName}`,
    body,
  })));
}

export async function queueExamProgressReport(enrollmentId: string, exam: ReportExamSummary): Promise<void> {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  if (!enrollment) return;
  const [student, program, lessons, practice, recipients] = await Promise.all([
    usersRepo.findById(enrollment.studentId),
    programsRepo.findByKey(enrollment.programKey),
    todaysLessons(enrollmentId),
    todaysPracticeSummary(enrollmentId),
    reportRecipients(enrollment.studentId),
  ]);
  if (!student || !program || recipients.length === 0) return;
  const body = reportBody({ studentName: student.displayName, programTitle: program.title, lessons, practice, exam });
  await Promise.all(recipients.map((recipient) => queueEmailNotification({
    userId: userId(recipient),
    kind: "exam_report",
    subject: `Exam report for ${student.displayName}`,
    body,
  })));
}
