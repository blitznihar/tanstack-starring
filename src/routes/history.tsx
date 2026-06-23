import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminParentShell } from "~/components/AppShell";
import { NotificationBell } from "~/components/NotificationBell";
import { studentHistory } from "~/server/rpc/student";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/history")({
  validateSearch: (s: Record<string, unknown>): { studentId?: string } => ({
    studentId: typeof s.studentId === "string" ? s.studentId : undefined,
  }),
  loaderDeps: ({ search }) => ({ studentId: search.studentId }),
  loader: ({ deps }) => studentHistory({ data: { studentId: deps.studentId } }),
  component: HistoryPage,
});

type StudentHistory = Awaited<ReturnType<typeof studentHistory>>;
type ProgramHistory = StudentHistory["programs"][number];
type HistoryDay = ProgramHistory["days"][number];
type HistoryTask = HistoryDay["tasks"][number];

function HistoryPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const viewerIsStudent = data.viewer.roles.includes("student");

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
              {data.programs.map((program) => (
                <ProgramHistorySection key={program.enrollmentId} program={program} canOpenTasks={false} />
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
            {data.programs.map((program) => (
              <ProgramHistorySection key={program.enrollmentId} program={program} canOpenTasks />
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

function ProgramHistorySection({ program, canOpenTasks }: { program: ProgramHistory; canOpenTasks: boolean }) {
  if (program.days.length === 0) return null;
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 22, boxShadow: "0 10px 24px rgba(54,48,74,.06)" }}>
      <h2 style={{ margin: "0 0 16px", fontWeight: 900, fontSize: 20 }}>{program.title}</h2>
      <div style={{ display: "grid", gap: 14 }}>
        {program.days.map((day) => (
          <HistoryDayCard key={`${program.enrollmentId}:${day.date}`} day={day} canOpenTasks={canOpenTasks} />
        ))}
      </div>
    </section>
  );
}

function HistoryDayCard({ day, canOpenTasks }: { day: HistoryDay; canOpenTasks: boolean }) {
  return (
    <section style={{ background: "#FBF4EA", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontWeight: 900, fontSize: 16 }}>{day.dateLabel}</h3>
        <span style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 12 }}>Day {day.index + 1}</span>
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {day.tasks.map((task) => (
          <HistoryTaskRow key={`${day.date}:${task.id}`} task={task} canOpenTasks={canOpenTasks} />
        ))}
      </div>
    </section>
  );
}

function HistoryTaskRow({ task, canOpenTasks }: { task: HistoryTask; canOpenTasks: boolean }) {
  const content = (
    <>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 900, color: "var(--s-ink)", fontSize: 14 }}>{task.title}</span>
        <span style={{ display: "block", color: "var(--s-muted)", fontWeight: 800, fontSize: 12, marginTop: 2 }}>
          {task.kind === "lesson" ? "Lesson" : task.kind === "practice" ? "Practice" : "Exam"} · {task.subject} {task.topic}
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
  return <div style={style}>{content}</div>;
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
