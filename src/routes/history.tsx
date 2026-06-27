import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminParentShell } from "~/components/AppShell";
import { NotificationBell } from "~/components/NotificationBell";
import { studentHistory } from "~/server/rpc/student";
import { examDetail } from "~/server/rpc/exam";
import { logout, me } from "~/server/rpc/session";

export const Route = createFileRoute("/history")({
  validateSearch: (s: Record<string, unknown>): { studentId?: string; examSessionId?: string } => ({
    studentId: typeof s.studentId === "string" ? s.studentId : undefined,
    examSessionId: typeof s.examSessionId === "string" ? s.examSessionId : undefined,
  }),
  loaderDeps: ({ search }) => ({ studentId: search.studentId, examSessionId: search.examSessionId }),
  loader: async ({ deps }) => {
    const user = await me();
    if (!user) throw redirect({ to: "/" });
    return {
      history: await studentHistory({ data: { studentId: deps.studentId } }),
      selectedExam: deps.examSessionId ? await examDetail({ data: { sessionId: deps.examSessionId } }) : null,
    };
  },
  component: HistoryPage,
});

type LoaderData = Awaited<ReturnType<typeof Route.useLoaderData>>;
type StudentHistory = LoaderData["history"];
type ProgramHistory = StudentHistory["programs"][number];
type HistoryDay = ProgramHistory["days"][number];
type HistoryTask = HistoryDay["tasks"][number];

function HistoryPage() {
  const loaded = Route.useLoaderData();
  const data = loaded.history;
  const selectedExam = loaded.selectedExam;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const viewerIsStudent = data.viewer.roles.includes("student");
  const closeExamDetail = () => navigate({ to: "/history", search: { studentId: search.studentId } });

  async function exit() {
    await doLogout({});
    navigate({ to: "/" });
  }

  const hasHistory = data.programs.some((program) => program.days.length > 0);

  if (!viewerIsStudent) {
    return (
      <AdminParentShell user={data.viewer} active="history" onLogout={exit}>
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 26px 60px" }}>
          <HistoryStudentSelector
            students={data.students}
            selectedId={data.studentId}
            onSelect={(studentId) => navigate({ to: "/history", search: { studentId } })}
          />
          <HistoryIntro available={data.available} firstName={data.firstName} studentName={data.studentName} adminTone />
          {!data.available ? (
            <section className="a-card" style={{ padding: 28, color: "var(--a-muted)", fontWeight: 700 }}>
              {data.students.length === 0 ? "No associated students are available yet." : "Select a student to view completed work."}
            </section>
          ) : !hasHistory ? (
            <section className="a-card" style={{ padding: 24, color: "var(--a-muted)", fontWeight: 800 }}>
              Completed lessons and practice will show up here.
            </section>
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              {selectedExam && <ExamDetailPanel exam={selectedExam} onClose={closeExamDetail} adminTone />}
              {data.programs.map((program) => (
                <ProgramHistorySection key={program.enrollmentId} program={program} canOpenTasks={false} canOpenExams studentId={data.studentId} />
              ))}
            </div>
          )}
        </main>
      </AdminParentShell>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--s-bg)", color: "var(--s-ink)", fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: "var(--s-surface)", borderBottom: "1px solid #EFE7DA" }}>
        <div style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", minHeight: 68, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", padding: "10px 0" }}>
          <Link to="/student" style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff" }} />
            </span>
            <span style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 20 }}>Comet</span>
          </Link>
          <nav style={{ display: "flex", gap: 8, color: "var(--s-muted)", fontWeight: 900, fontSize: 14 }}>
            <Link to="/student" style={navLink(false)}>Home</Link>
            <Link to="/history" style={navLink(true)}>History</Link>
            <Link to="/practice" style={navLink(false)}>Topics</Link>
            <Link to="/wallet" style={navLink(false)}>Wallet</Link>
          </nav>
          <div style={{ flex: 1 }} />
          <span style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 13 }}>{data.displayName}</span>
          <NotificationBell tone="student" />
          <button onClick={exit} style={{ border: "1px solid #EFE7DA", background: "#fff", boxShadow: "0 8px 18px rgba(54,48,74,.06)", color: "var(--s-muted)", borderRadius: 12, padding: "10px 15px", cursor: "pointer", fontWeight: 900 }}>
            Exit
          </button>
        </div>
      </header>

      <main style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", padding: "34px 0 54px" }}>
        <HistoryIntro available={data.available} firstName={data.firstName} studentName={data.studentName} />

        {!hasHistory ? (
          <section style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 10px 24px rgba(54,48,74,.06)", color: "var(--s-muted)", fontWeight: 900 }}>
            Completed lessons and practice will show up here.
          </section>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {selectedExam && <ExamDetailPanel exam={selectedExam} onClose={closeExamDetail} />}
            {data.programs.map((program) => (
              <ProgramHistorySection key={program.enrollmentId} program={program} canOpenTasks canOpenExams />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function HistoryIntro({ available, firstName, studentName, adminTone = false }: { available: boolean; firstName: string; studentName: string; adminTone?: boolean }) {
  const muted = adminTone ? "var(--a-muted)" : "var(--s-muted)";
  const ink = adminTone ? "var(--a-ink)" : "var(--s-ink)";
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ color: muted, fontWeight: 900, fontSize: 15, marginBottom: 8 }}>Completed work</div>
      <h1 style={{ fontFamily: adminTone ? "'Manrope', sans-serif" : "'Baloo 2', sans-serif", color: ink, fontWeight: 800, fontSize: adminTone ? 27 : "clamp(34px, 5vw, 48px)", lineHeight: 1.05, margin: 0 }}>
        {available ? `${firstName}'s history` : "Student history"}
      </h1>
      {adminTone && available && (
        <p style={{ margin: "7px 0 0", color: muted, fontWeight: 700, fontSize: 14 }}>{studentName}'s completed lessons, practice, and exams.</p>
      )}
    </section>
  );
}

function HistoryStudentSelector({
  students,
  selectedId,
  onSelect,
}: {
  students: { id: string; displayName: string; username: string }[];
  selectedId: string;
  onSelect: (studentId: string) => void;
}) {
  if (students.length <= 1 && selectedId) return null;
  return (
    <section className="a-card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Students</h2>
          <p style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5, margin: 0 }}>{students.length} associated student{students.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
        {students.map((student) => {
          const active = selectedId === student.id;
          return (
            <button key={student.id} onClick={() => onSelect(student.id)} style={studentButton(active)}>
              <span style={{ display: "block", fontWeight: 900, fontSize: 14 }}>{student.displayName}</span>
              <span style={{ display: "block", color: active ? "var(--a-accent)" : "var(--a-muted)", fontWeight: 800, fontSize: 11.5 }}>
                {active ? "Selected" : `@${student.username}`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProgramHistorySection({ program, canOpenTasks, canOpenExams, studentId }: { program: ProgramHistory; canOpenTasks: boolean; canOpenExams: boolean; studentId?: string }) {
  if (program.days.length === 0) return null;
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 22, boxShadow: "0 10px 24px rgba(54,48,74,.06)" }}>
      <h2 style={{ margin: "0 0 16px", fontWeight: 900, fontSize: 20 }}>{program.title}</h2>
      <div style={{ display: "grid", gap: 14 }}>
        {program.days.map((day: HistoryDay) => (
          <HistoryDayCard key={`${program.enrollmentId}:${day.date}`} day={day} canOpenTasks={canOpenTasks} canOpenExams={canOpenExams} studentId={studentId} />
        ))}
      </div>
    </section>
  );
}

function HistoryDayCard({ day, canOpenTasks, canOpenExams, studentId }: { day: HistoryDay; canOpenTasks: boolean; canOpenExams: boolean; studentId?: string }) {
  return (
    <section style={{ background: "#FBF4EA", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontWeight: 900, fontSize: 16 }}>{day.dateLabel}</h3>
        <span style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 12 }}>Day {day.index + 1}</span>
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {day.tasks.map((task: HistoryTask) => (
          <HistoryTaskRow key={`${day.date}:${task.id}`} task={task} canOpenTasks={canOpenTasks} canOpenExams={canOpenExams} studentId={studentId} />
        ))}
      </div>
    </section>
  );
}

function HistoryTaskRow({ task, canOpenTasks, canOpenExams, studentId }: { task: HistoryTask; canOpenTasks: boolean; canOpenExams: boolean; studentId?: string }) {
  const content = (
    <>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 900, color: "var(--s-ink)", fontSize: 14 }}>{task.title}</span>
        <span style={{ display: "block", color: "var(--s-muted)", fontWeight: 800, fontSize: 12, marginTop: 2 }}>
          {task.kind === "lesson" ? "Lesson" : task.kind === "practice" ? "Practice" : "Exam"} · {task.meta || `${task.subject} ${task.topic}`}
        </span>
      </span>
      <span style={{ color: "#0E7A55", background: "var(--s-success-soft)", borderRadius: 999, padding: "4px 9px", fontWeight: 900, fontSize: 11 }}>COMPLETED</span>
    </>
  );
  const style: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", background: "#fff", borderRadius: 13, padding: 12 };
  if (canOpenTasks && task.kind === "practice" && task.subjectKey && task.topic) {
    return <Link to="/practice" search={{ subject: task.subjectKey, standardCode: task.topic, workDate: task.workDate, lesson: 1, review: 1 }} style={style}>{content}</Link>;
  }
  if (canOpenTasks && task.kind === "lesson" && task.subjectKey && task.topic) {
    return <Link to="/lesson" search={{ subject: task.subjectKey, standardCode: task.topic, workDate: task.workDate }} style={style}>{content}</Link>;
  }
  if (canOpenExams && task.kind === "exam" && task.examSessionId) {
    return <Link to="/history" search={{ studentId, examSessionId: task.examSessionId }} style={style}>{content}</Link>;
  }
  return <div style={style}>{content}</div>;
}

type ExamDetail = NonNullable<LoaderData["selectedExam"]>;
function ExamDetailPanel({ exam, onClose, adminTone = false }: { exam: ExamDetail; onClose: () => void; adminTone?: boolean }) {
  const s = exam.summary;
  const panelStyle: React.CSSProperties = adminTone
    ? { background: "#fff", border: "1px solid var(--a-border)", borderRadius: 14, padding: 20, boxShadow: "0 10px 24px rgba(10,20,40,.06)" }
    : { background: "#fff", borderRadius: 20, padding: 22, boxShadow: "0 10px 24px rgba(54,48,74,.06)" };
  return (
    <section style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start", marginBottom: 16 }}>
        <div>
          <div style={{ color: adminTone ? "var(--a-muted)" : "var(--s-muted)", fontWeight: 900, fontSize: 13 }}>Exam Details</div>
          <h2 style={{ margin: "3px 0 0", fontWeight: 900, fontSize: 22 }}>{s.examName}</h2>
        </div>
        <button onClick={onClose} style={{ border: "1px solid #E7DFEF", background: "#fff", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 900, color: adminTone ? "var(--a-muted)" : "var(--s-muted)" }}>Close</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
        <ExamMetric label="Solved" value={`${s.questionsSolved}`} />
        <ExamMetric label="Right / Wrong" value={`${s.correctCount} / ${s.wrongCount}`} />
        <ExamMetric label="Score" value={`${s.scorePct}%`} />
        <ExamMetric label="Final Robux" value={`${s.finalRobux}`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8, marginBottom: 18, color: adminTone ? "var(--a-muted)" : "var(--s-muted)", fontWeight: 800, fontSize: 13 }}>
        <span>Raw correct reward: +{s.rawCorrectReward}</span>
        <span>Wrong penalties: {s.wrongPenaltyTotal ? `-${s.wrongPenaltyTotal}` : "0"}</span>
        <span>Cap adjustment: {s.capAdjustment}</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {exam.questions.map((question: ExamDetail["questions"][number]) => (
          <article key={question.itemId} style={{ border: "1px solid #EFE7F6", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 900, color: "var(--s-ink)", marginBottom: 5 }}>{question.num}. {question.prompt}</div>
            <div style={{ color: adminTone ? "var(--a-muted)" : "var(--s-muted)", fontWeight: 800, fontSize: 12, marginBottom: 9 }}>{question.teks}</div>
            <DetailRow label="Student answer" value={question.studentAnswer} />
            <DetailRow label="Correct answer" value={question.correctAnswer} />
            <DetailRow label="Result" value={`${question.result} · ${question.robuxImpact > 0 ? "+" : ""}${question.robuxImpact} Robux`} good={question.correct} bad={!question.correct && !question.pending} />
            {question.whyWrong && <DetailRow label="Why it missed" value={question.whyWrong} />}
            {question.explanation && <DetailRow label="Explanation" value={question.explanation} />}
          </article>
        ))}
      </div>
    </section>
  );
}

function ExamMetric({ label, value }: { label: string; value: string }) {
  return <div style={{ background: "#F8F6FC", borderRadius: 10, padding: 12 }}><div style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 12 }}>{label}</div><div style={{ fontWeight: 900, fontSize: 18 }}>{value}</div></div>;
}

function DetailRow({ label, value, good = false, bad = false }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 10, padding: "7px 0", borderTop: "1px solid #F1ECF7", fontSize: 13.5 }}>
      <span style={{ color: "var(--s-muted)", fontWeight: 800 }}>{label}</span>
      <span style={{ fontWeight: 800, color: good ? "#0E7A55" : bad ? "#C2491F" : "var(--s-ink)" }}>{value}</span>
    </div>
  );
}

function studentButton(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid var(--a-accent)" : "1px solid var(--a-border)",
    background: active ? "var(--a-accent-soft)" : "#fff",
    color: "var(--a-ink)",
    borderRadius: 10,
    padding: "12px 13px",
    textAlign: "left",
    cursor: "pointer",
  };
}

function navLink(active: boolean): React.CSSProperties {
  return {
    color: active ? "var(--s-primary-ink)" : "var(--s-muted)",
    padding: "8px 9px",
    borderRadius: 9,
  };
}
