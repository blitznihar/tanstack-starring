import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { studentHistory } from "~/server/rpc/student";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/history")({
  loader: () => studentHistory(),
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

  async function exit() {
    await doLogout({});
    navigate({ to: "/" });
  }

  const hasHistory = data.programs.some((program) => program.days.length > 0);

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
          <button onClick={exit} style={{ border: "1px solid #EFE7DA", background: "#fff", boxShadow: "0 8px 18px rgba(54,48,74,.06)", color: "var(--s-muted)", borderRadius: 12, padding: "10px 15px", cursor: "pointer", fontWeight: 900 }}>
            Exit
          </button>
        </div>
      </header>

      <main style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", padding: "34px 0 54px" }}>
        <section style={{ marginBottom: 22 }}>
          <div style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 15, marginBottom: 8 }}>Completed work</div>
          <h1 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: "clamp(34px, 5vw, 48px)", lineHeight: 1, margin: 0 }}>{data.firstName}'s history</h1>
        </section>

        {!hasHistory ? (
          <section style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 10px 24px rgba(54,48,74,.06)", color: "var(--s-muted)", fontWeight: 900 }}>
            Completed lessons and practice will show up here.
          </section>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {data.programs.map((program) => (
              <ProgramHistorySection key={program.enrollmentId} program={program} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProgramHistorySection({ program }: { program: ProgramHistory }) {
  if (program.days.length === 0) return null;
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 22, boxShadow: "0 10px 24px rgba(54,48,74,.06)" }}>
      <h2 style={{ margin: "0 0 16px", fontWeight: 900, fontSize: 20 }}>{program.title}</h2>
      <div style={{ display: "grid", gap: 14 }}>
        {program.days.map((day) => (
          <HistoryDayCard key={`${program.enrollmentId}:${day.date}`} day={day} />
        ))}
      </div>
    </section>
  );
}

function HistoryDayCard({ day }: { day: HistoryDay }) {
  return (
    <section style={{ background: "#FBF4EA", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontWeight: 900, fontSize: 16 }}>{day.dateLabel}</h3>
        <span style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 12 }}>Day {day.index + 1}</span>
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        {day.tasks.map((task) => (
          <HistoryTaskRow key={`${day.date}:${task.id}`} task={task} />
        ))}
      </div>
    </section>
  );
}

function HistoryTaskRow({ task }: { task: HistoryTask }) {
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
  if (task.kind === "practice" && task.subjectKey && task.topic) {
    return <Link to="/practice" search={{ subject: task.subjectKey, standardCode: task.topic, workDate: task.workDate, lesson: 1, review: 1 }} style={style}>{content}</Link>;
  }
  if (task.kind === "lesson" && task.subjectKey && task.topic) {
    return <Link to="/lesson" search={{ subject: task.subjectKey, standardCode: task.topic, workDate: task.workDate }} style={style}>{content}</Link>;
  }
  return <div style={style}>{content}</div>;
}

function navLink(active: boolean): React.CSSProperties {
  return {
    color: active ? "var(--s-primary-ink)" : "var(--s-muted)",
    padding: "8px 9px",
    borderRadius: 9,
  };
}
