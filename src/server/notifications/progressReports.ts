import { contentRepo } from "~/repositories/content.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { lessonProgressRepo } from "~/repositories/lessonProgress.js";
import { programsRepo } from "~/repositories/programs.js";
import { responsesRepo } from "~/repositories/responses.js";
import { usersRepo } from "~/repositories/users.js";
import { parentsForStudent, userId } from "~/server/users/associations.js";
import { queueEmailNotification } from "./email.js";
import type { PracticeCompletionQuestion } from "~/server/practice/practice.js";

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

async function todaysLessons(enrollmentId: string): Promise<string[]> {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  if (!enrollment) return [];
  const [completed, standards] = await Promise.all([
    lessonProgressRepo.completedToday(enrollmentId),
    contentRepo.listStandards(enrollment.programKey),
  ]);
  const standardTitles = new Map(standards.map((standard) => [standard.code, standard.description ?? standard.code]));
  return completed.map((lesson) => {
    const title = standardTitles.get(lesson.standardCode);
    return [lesson.subject.toUpperCase(), `TEKS ${lesson.standardCode}`, title].filter(Boolean).join(" - ");
  });
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
  practiceDetail?: PracticeCompletionQuestion[];
  practiceEarned?: number;
  exam?: ReportExamSummary;
}): string {
  const robuxDelta = (value: number) => `${value > 0 ? "+" : ""}${value} Robux`;
  const lessons = input.lessons.length
    ? input.lessons.map((lesson) => `<li>${escapeHtml(lesson)}</li>`).join("")
    : "";
  const practiceDetail = input.practiceDetail?.length
    ? `
      <h3 style="margin:20px 0 8px;color:#2f2943;">Practice Details</h3>
      ${input.practiceDetail.map((question) => `
        <div style="border:1px solid #e4dced;border-radius:10px;padding:12px;margin:0 0 10px;">
          <div style="font-weight:800;color:#2f2943;margin-bottom:6px;">${question.num}. ${escapeHtml(question.prompt)}</div>
          <div style="font-size:12px;color:#746b88;margin-bottom:8px;">${escapeHtml(question.teks)}</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:7px;border:1px solid #eee7f5;width:34%;">Student answer</td><td style="padding:7px;border:1px solid #eee7f5;"><strong>${escapeHtml(question.studentAnswer)}</strong></td></tr>
            <tr><td style="padding:7px;border:1px solid #eee7f5;">Correct answer</td><td style="padding:7px;border:1px solid #eee7f5;"><strong>${escapeHtml(question.correctAnswer)}</strong></td></tr>
            <tr><td style="padding:7px;border:1px solid #eee7f5;">Result</td><td style="padding:7px;border:1px solid #eee7f5;color:${question.correct ? "#0b7a58" : "#c2491f"};"><strong>${question.correct ? "Correct" : "Incorrect"}</strong>${question.awarded ? ` · ${robuxDelta(question.awarded)}` : ""}</td></tr>
            ${question.whyWrong ? `<tr><td style="padding:7px;border:1px solid #eee7f5;">Why the wrong answer missed</td><td style="padding:7px;border:1px solid #eee7f5;">${escapeHtml(question.whyWrong)}</td></tr>` : ""}
            ${question.whyRight ? `<tr><td style="padding:7px;border:1px solid #eee7f5;">Student-screen explanation</td><td style="padding:7px;border:1px solid #eee7f5;">${escapeHtml(question.whyRight)}</td></tr>` : ""}
          </table>
        </div>
      `).join("")}`
    : "";
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

      <h3 style="margin:0 0 8px;color:#2f2943;">Summary</h3>
      <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
        <tr>
          <td style="padding:8px;border:1px solid #e4dced;">Questions solved</td>
          <td style="padding:8px;border:1px solid #e4dced;"><strong>${input.practice.solved}</strong></td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #e4dced;">Right / Wrong</td>
          <td style="padding:8px;border:1px solid #e4dced;"><strong>${input.practice.right}</strong> right, <strong>${input.practice.wrong}</strong> wrong</td>
        </tr>
        ${input.practiceEarned == null ? "" : `<tr><td style="padding:8px;border:1px solid #e4dced;">Practice Robux earned</td><td style="padding:8px;border:1px solid #e4dced;"><strong>${input.practiceEarned}</strong></td></tr>`}
      </table>

      ${lessons ? `<h3 style="margin:0 0 8px;color:#2f2943;">Lessons Completed Today</h3><ul style="margin:0 0 18px;padding-left:20px;">${lessons}</ul>` : ""}

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
      ${practiceDetail}
      ${exam}
    </div>`;
}

export async function queuePracticeProgressReport(
  enrollmentId: string,
  detail?: {
    subject: string;
    questions: PracticeCompletionQuestion[];
    summary: { solved: number; right: number; wrong: number; earned: number };
  },
): Promise<void> {
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
  const body = reportBody({
    studentName: student.displayName,
    programTitle: program.title,
    lessons,
    practice: detail?.summary ?? practice,
    practiceDetail: detail?.questions,
    practiceEarned: detail?.summary.earned,
  });
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
