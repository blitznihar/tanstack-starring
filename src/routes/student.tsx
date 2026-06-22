import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { studentHome } from "~/server/rpc/student";
import { startExam } from "~/server/rpc/exam";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/student")({
  loader: () => studentHome(),
  component: StudentDashboard,
});

type StudentHome = Awaited<ReturnType<typeof studentHome>>;
type ProgramView = NonNullable<StudentHome["primary"]>;

function StudentDashboard() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const doStartExam = useServerFn(startExam);
  const [launchingExam, setLaunchingExam] = useState(false);
  const primary = data.primary;

  async function exit() {
    await doLogout({});
    navigate({ to: "/" });
  }

  async function launchScheduledExam(program: ProgramView) {
    const task = program.nextIncompleteTask?.kind === "exam" ? program.nextIncompleteTask : program.todayTasks.find((entry) => entry.kind === "exam");
    if (!task || launchingExam) return;
    setLaunchingExam(true);
    try {
      const result = await doStartExam({
        data: {
          enrollmentId: program.enrollmentId,
          kind: "progressive",
          durationSeconds: (task.durationMinutes ?? 60) * 60,
        },
      });
      navigate({ to: "/exam/$sessionId", params: { sessionId: result.sessionId } });
    } catch (error) {
      setLaunchingExam(false);
      alert(error instanceof Error ? error.message : String(error));
    }
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
            <Link to="/student" style={navLink(true)}>Home</Link>
            <Link to="/history" style={navLink(false)}>History</Link>
            <Link to="/practice" style={navLink(false)}>Topics</Link>
            <Link to="/wallet" style={navLink(false)}>Wallet</Link>
          </nav>
          <div style={{ flex: 1 }} />
          <StatusPill color="var(--s-accent)" bg="var(--s-accent-soft)" value={`${data.overall.maxStreak} day streak`} />
          <StatusPill color="#B47900" bg="var(--s-robux-soft)" value={`${data.overall.availableRobux} Robux`} coin />
          <button onClick={exit} style={{ border: "1px solid #EFE7DA", background: "#fff", boxShadow: "0 8px 18px rgba(54,48,74,.06)", color: "var(--s-muted)", borderRadius: 12, padding: "10px 15px", cursor: "pointer", fontWeight: 900 }}>
            Exit
          </button>
        </div>
      </header>

      <main style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", padding: "34px 0 54px" }}>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "start", marginBottom: 20 }}>
          <div>
            <div style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 15, marginBottom: 8 }}>Good afternoon,</div>
            <h1 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: "clamp(34px, 5vw, 48px)", lineHeight: 1, margin: 0 }}>Hi {data.firstName}!</h1>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Metric value={data.overall.maxStreak} label="day streak" tone="accent" />
            <Metric value={data.overall.availableRobux} label="Robux" tone="robux" />
          </div>
        </section>

        <section style={{ marginBottom: 18 }}>
          <div style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 13, letterSpacing: 0, textTransform: "uppercase", marginBottom: 10 }}>My programs</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.programs.length === 0 ? (
              <EmptyCard>No programs are available yet.</EmptyCard>
            ) : (
              data.programs.map((program, index) => <ProgramCard key={program.enrollmentId} program={program} active={index === 0} />)
            )}
          </div>
        </section>

        {primary ? (
          <>
            <TodayPanel program={primary} launchingExam={launchingExam} onStartExam={launchScheduledExam} />
            <FinishedTodayPanel tasks={primary.finishedTodayTasks} />
            <TomorrowPlanPanel program={primary} />
            <ScheduleBand program={primary} />
            <section style={{ display: "grid", gridTemplateColumns: "minmax(280px,1.25fr) minmax(260px,.95fr)", gap: 18, alignItems: "stretch" }}>
              <WeekPanel program={primary} />
              <div style={{ display: "grid", gap: 18 }}>
                <ActionTile to="/practice" title="Practice now" subtitle="Warm-up and earn Robux" color="var(--s-success)" bg="#D9F6EC" />
                <ActionTile to="/wallet" title="Robux wallet" subtitle={`${data.overall.availableRobux} to spend`} color="var(--s-robux)" bg="#FFF1C9" />
                <ExamTile exams={data.scheduledExams} />
              </div>
            </section>
          </>
        ) : (
          <EmptyCard>Ask an admin to add a program before practice starts.</EmptyCard>
        )}
      </main>
    </div>
  );
}

function StatusPill({ value, bg, color, coin = false }: { value: string; bg: string; color: string; coin?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: bg, color, fontWeight: 900, fontSize: 13, padding: "9px 14px", borderRadius: 999, whiteSpace: "nowrap" }}>
      <span style={{ width: 13, height: 13, borderRadius: "50%", background: color, display: "inline-block" }}>{coin ? "" : null}</span>
      {value}
    </span>
  );
}

function Metric({ value, label, tone }: { value: number; label: string; tone: "accent" | "robux" }) {
  const color = tone === "accent" ? "var(--s-accent)" : "var(--s-robux)";
  return (
    <div style={{ width: 94, minHeight: 86, background: "#fff", borderRadius: 18, display: "grid", placeItems: "center", boxShadow: "0 12px 28px rgba(54,48,74,.08)", padding: 10 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ color, fontWeight: 900, fontSize: 24 }}>{value}</div>
        <div style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 12 }}>{label}</div>
      </div>
    </div>
  );
}

function ProgramCard({ program, active }: { program: ProgramView; active: boolean }) {
  return (
    <div style={{ minWidth: 220, background: active ? "#fff" : "#FFF8EF", border: active ? "2px solid #2F63F4" : "1px solid #EFDCC5", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: active ? "0 8px 18px rgba(47,99,244,.08)" : "none" }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: active ? "#2F63F4" : "var(--s-primary)", flex: "none" }} />
      <span>
        <span style={{ display: "block", fontWeight: 900, fontSize: 14 }}>{program.title}</span>
        <span style={{ display: "block", color: "var(--s-muted)", fontWeight: 800, fontSize: 12 }}>{program.targetDays}-day plan · {program.progressPct}% done</span>
      </span>
    </div>
  );
}

function TodayPanel({ program, launchingExam, onStartExam }: { program: ProgramView; launchingExam: boolean; onStartExam: (program: ProgramView) => Promise<void> }) {
  const tasks = program.todayTasks;
  const nextTask = program.nextIncompleteTask;
  const hasExam = nextTask?.kind === "exam";
  const pendingCount = tasks.filter((task) => !task.completed).length;
  const planIsFuture = !!program.nextWorkDate && program.nextWorkDate > program.calendarDate;
  const headline = program.allTodayCompleted ? "Excellent work today" : `${pendingCount || tasks.length || 0} ${pendingCount === 1 ? "thing" : "things"} to finish ${planIsFuture ? "tomorrow" : "today"}`;
  const ctaText = program.allTodayCompleted
    ? program.nextWorkCompletedCount > 0 ? "Continue tomorrow's work" : "Start tomorrow's work"
    : planIsFuture
      ? program.nextWorkCompletedCount > 0 ? "Continue tomorrow's work" : "Start tomorrow's work"
    : program.hasStartedToday
      ? "Continue today's work"
      : "Start today's work";
  const lessonSubject = nextTask?.subjectKey || program.subjects[0] || "math";
  const taskSearch = {
    subject: lessonSubject,
    standardCode: nextTask?.topic || undefined,
    workDate: nextTask?.workDate || program.todayDate || undefined,
  };
  return (
    <section style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg,#6C4CE0,#7F61EC)", borderRadius: 28, padding: 28, color: "#fff", boxShadow: "0 18px 38px rgba(108,76,224,.22)", marginBottom: 18 }}>
      <div style={{ position: "absolute", width: 148, height: 148, borderRadius: "50%", right: -28, top: -36, background: "rgba(255,255,255,.14)" }} />
      <div style={{ position: "absolute", width: 124, height: 124, borderRadius: "50%", right: 64, bottom: -62, background: "rgba(255,255,255,.12)" }} />
      <span style={{ display: "inline-flex", background: "rgba(255,255,255,.18)", padding: "8px 14px", borderRadius: 999, fontWeight: 900, fontSize: 13, marginBottom: 18 }}>{program.todayDate > program.calendarDate ? "Tomorrow's plan" : "Today's plan"}</span>
      <h2 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 28, margin: "0 0 22px" }}>{headline}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, position: "relative" }}>
        {tasks.length === 0 ? <TaskCard title="All caught up" meta={program.title} kind="practice" completed /> : tasks.map((task) => <TaskCard key={task.id} task={task} title={task.title} meta={`${task.subject} · ${task.meta}`} kind={task.kind} completed={task.completed} />)}
      </div>
      {hasExam ? (
        <button onClick={() => onStartExam(program)} disabled={launchingExam} style={{ display: "inline-flex", marginTop: 22, background: "#fff", color: "var(--s-primary-ink)", border: "none", borderRadius: 16, padding: "16px 25px", fontWeight: 900, fontSize: 15, cursor: launchingExam ? "wait" : "pointer", fontFamily: "inherit" }}>
          {launchingExam ? "Starting exam..." : "Start today's exam"}
        </button>
      ) : nextTask?.kind === "practice" ? (
        <Link to="/practice" search={{ ...taskSearch, lesson: 1 }} style={{ display: "inline-flex", marginTop: 22, background: "#fff", color: "var(--s-primary-ink)", borderRadius: 16, padding: "16px 25px", fontWeight: 900, fontSize: 15 }}>
          {ctaText}
        </Link>
      ) : (
        <Link to="/lesson" search={taskSearch} style={{ display: "inline-flex", marginTop: 22, background: "#fff", color: "var(--s-primary-ink)", borderRadius: 16, padding: "16px 25px", fontWeight: 900, fontSize: 15 }}>
          {ctaText}
        </Link>
      )}
    </section>
  );
}

function TaskCard({ title, meta, kind, completed, task }: { title: string; meta: string; kind: string; completed: boolean; task?: ProgramView["todayTasks"][number] }) {
  const dot = kind === "exam" ? "var(--s-robux)" : kind === "practice" ? "#C9B9FF" : "var(--s-accent)";
  const status = completed ? "COMPLETED" : "PENDING";
  const card = (
    <div style={{ background: completed ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.15)", borderRadius: 14, padding: 15, minHeight: 106, color: "#120E24", border: completed ? "2px solid rgba(255,255,255,.45)" : "2px solid transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#160F30", fontWeight: 900, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
        {kind}
        <span style={{ marginLeft: "auto", color: completed ? "#0E7A55" : "#443D58", background: "rgba(255,255,255,.74)", borderRadius: 999, padding: "2px 7px", fontSize: 10 }}>{status}</span>
      </div>
      <div style={{ fontWeight: 900, fontSize: 15.5, lineHeight: 1.25 }}>{title}</div>
      <div style={{ fontWeight: 800, fontSize: 12, marginTop: 5, opacity: .72 }}>{meta}</div>
    </div>
  );
  if (!task?.completed || !task.subjectKey || !task.topic || (task.kind !== "lesson" && task.kind !== "practice")) return card;
  const search = { subject: task.subjectKey, standardCode: task.topic, workDate: task.workDate };
  if (task.kind === "practice") {
    return <Link to="/practice" search={{ ...search, lesson: 1, review: 1 }} style={{ display: "block" }}>{card}</Link>;
  }
  return <Link to="/lesson" search={search} style={{ display: "block" }}>{card}</Link>;
}

function FinishedTodayPanel({ tasks }: { tasks: ProgramView["finishedTodayTasks"] }) {
  if (tasks.length === 0) return null;
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 10px 24px rgba(54,48,74,.06)", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontWeight: 900, fontSize: 18 }}>Finished today</h2>
        <Link to="/history" style={{ color: "var(--s-primary-ink)", fontWeight: 900, fontSize: 13 }}>View history</Link>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {tasks.map((task) => (
          <CompletedRow key={`${task.workDate}:${task.id}`} task={task} />
        ))}
      </div>
    </section>
  );
}

function CompletedRow({ task }: { task: ProgramView["finishedTodayTasks"][number] }) {
  const search = { subject: task.subjectKey, standardCode: task.topic, workDate: task.workDate };
  const label = `${task.kind === "lesson" ? "Lesson" : task.kind === "practice" ? "Practice" : "Exam"} · ${task.subject} ${task.topic}`;
  const content = (
    <>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 900, color: "var(--s-ink)", fontSize: 14 }}>{task.title}</span>
        <span style={{ display: "block", color: "var(--s-muted)", fontWeight: 800, fontSize: 12, marginTop: 2 }}>{label}</span>
      </span>
      <span style={{ color: "#0E7A55", background: "var(--s-success-soft)", borderRadius: 999, padding: "4px 9px", fontWeight: 900, fontSize: 11 }}>COMPLETED</span>
    </>
  );
  const style: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", background: "#FBF4EA", borderRadius: 13, padding: 12 };
  if (task.kind === "practice") return <Link to="/practice" search={{ ...search, lesson: 1, review: 1 }} style={style}>{content}</Link>;
  if (task.kind === "lesson") return <Link to="/lesson" search={search} style={style}>{content}</Link>;
  return <div style={style}>{content}</div>;
}

function TomorrowPlanPanel({ program }: { program: ProgramView }) {
  const tasks = program.nextWorkTasks ?? [];
  if (!program.allTodayCompleted || !program.nextWorkDate || program.nextWorkDate === program.todayDate || tasks.length === 0) return null;
  const nextTask = program.nextWorkIncompleteTask ?? tasks.find((task) => !task.completed) ?? null;
  const lessonSubject = nextTask?.subjectKey || program.subjects[0] || "math";
  const taskSearch = {
    subject: lessonSubject,
    standardCode: nextTask?.topic || undefined,
    workDate: nextTask?.workDate || program.nextWorkDate || undefined,
  };
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 10px 24px rgba(54,48,74,.06)", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: 18 }}>Tomorrow's plan</h2>
          <div style={{ color: "var(--s-muted)", fontWeight: 800, fontSize: 12, marginTop: 3 }}>{tasks.length} things queued for the next work day</div>
        </div>
        {nextTask?.kind === "practice" ? (
          <Link to="/practice" search={{ ...taskSearch, lesson: 1 }} style={smallPrimaryButton}>Start tomorrow's work</Link>
        ) : (
          <Link to="/lesson" search={taskSearch} style={smallPrimaryButton}>Start tomorrow's work</Link>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10 }}>
        {tasks.map((task) => (
          <PreviewTaskCard key={`${task.workDate}:${task.id}`} task={task} />
        ))}
      </div>
    </section>
  );
}

function PreviewTaskCard({ task }: { task: ProgramView["nextWorkTasks"][number] }) {
  const dot = task.kind === "exam" ? "var(--s-robux)" : task.kind === "practice" ? "#C9B9FF" : "var(--s-accent)";
  return (
    <div style={{ background: "#F3ECFF", borderRadius: 14, padding: 14, minHeight: 102, color: "#120E24", border: "2px solid #E7DAFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#160F30", fontWeight: 900, fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
        {task.kind}
        <span style={{ marginLeft: "auto", color: "#443D58", background: "#fff", borderRadius: 999, padding: "2px 7px", fontSize: 10 }}>PENDING</span>
      </div>
      <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.25 }}>{task.title}</div>
      <div style={{ fontWeight: 800, fontSize: 12, marginTop: 5, opacity: .72 }}>{task.subject} · {task.meta}</div>
    </div>
  );
}

function ScheduleBand({ program }: { program: ProgramView }) {
  return (
    <section style={{ background: "#EDE5FF", borderRadius: 20, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ color: "var(--s-primary-ink)", fontWeight: 900, fontSize: 16 }}>On schedule · {program.title}</div>
        <div style={{ color: "var(--s-muted)", fontWeight: 800, fontSize: 13, marginTop: 5 }}>{program.topicsCompleted}/{program.topicsTotal || 1} topics complete</div>
      </div>
      <Link to="/practice" style={bandButton(true)}>Do tomorrow's work +1</Link>
      <Link to="/practice" style={bandButton(false)}>Do a week +5</Link>
    </section>
  );
}

function WeekPanel({ program }: { program: ProgramView }) {
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 22, boxShadow: "0 10px 24px rgba(54,48,74,.06)" }}>
      <h2 style={{ margin: "0 0 14px", fontWeight: 900, fontSize: 18 }}>This week</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {program.week.map((day, index) => {
          const done = day.status === "done";
          const color = done ? "var(--s-success)" : index % 3 === 0 ? "var(--s-primary)" : index % 3 === 1 ? "var(--s-success)" : "var(--s-accent)";
          return (
            <div key={day.index} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 12, alignItems: "center", background: "#FBF4EA", borderRadius: 13, padding: 12 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 12 }}>{day.dayLabel}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 900, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{day.title}</span>
                <span style={{ display: "block", color: "var(--s-muted)", fontWeight: 800, fontSize: 12 }}>{day.type} · {day.dateLabel}</span>
              </span>
              <span style={{ color: done ? "var(--s-success)" : "var(--s-accent)", fontWeight: 900, fontSize: 13 }}>{done ? "Done" : day.scoreLabel}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionTile({ to, title, subtitle, color, bg }: { to: "/practice" | "/wallet"; title: string; subtitle: string; color: string; bg: string }) {
  return (
    <Link to={to} style={{ background: bg, borderRadius: 20, padding: 22, minHeight: 150, display: "flex", flexDirection: "column", justifyContent: "center", color: "var(--s-ink)", boxShadow: "0 10px 24px rgba(54,48,74,.04)" }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: color, marginBottom: 18 }} />
      <span style={{ fontWeight: 900, fontSize: 18 }}>{title}</span>
      <span style={{ color: "#277E68", fontWeight: 800, fontSize: 14, marginTop: 6 }}>{subtitle}</span>
    </Link>
  );
}

function ExamTile({ exams }: { exams: StudentHome["scheduledExams"] }) {
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 18, boxShadow: "0 10px 24px rgba(54,48,74,.05)" }}>
      <h2 style={{ margin: "0 0 10px", fontWeight: 900, fontSize: 16 }}>Scheduled exams</h2>
      {exams.length === 0 ? (
        <div style={{ color: "var(--s-muted)", fontWeight: 800, fontSize: 13 }}>No exams scheduled this week.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {exams.slice(0, 3).map((exam) => (
            <div key={`${exam.programTitle}:${exam.date}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "var(--s-muted)", fontWeight: 800, fontSize: 13 }}>
              <span>{exam.title}</span>
              <span>{exam.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#fff", borderRadius: 18, padding: 22, color: "var(--s-muted)", fontWeight: 900 }}>{children}</div>;
}

const smallPrimaryButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--s-primary)",
  color: "#fff",
  borderRadius: 12,
  padding: "11px 15px",
  fontWeight: 900,
  fontSize: 13,
  whiteSpace: "nowrap",
};

function navLink(active: boolean): React.CSSProperties {
  return {
    color: active ? "var(--s-primary-ink)" : "var(--s-muted)",
    padding: "8px 9px",
    borderRadius: 9,
  };
}

function bandButton(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    background: primary ? "var(--s-primary)" : "#fff",
    color: primary ? "#fff" : "var(--s-primary-ink)",
    boxShadow: primary ? "none" : "0 8px 18px rgba(54,48,74,.08)",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 900,
    fontSize: 13,
    whiteSpace: "nowrap",
  };
}
