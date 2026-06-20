import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminParentShell } from "~/components/AppShell";
import { managedPlans, planMarkDay } from "~/server/rpc/schedule";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/admin/scheduler")({
  loader: async () => {
    const user = await me();
    const isStaff = !!user?.roles.some((r) => r === "admin" || r === "super_admin");
    return { user, schedules: await managedPlans({ data: { autoSelect: !isStaff } }) };
  },
  component: SchedulerPage,
});

type Schedules = Awaited<ReturnType<typeof managedPlans>>;
type ManagedPlan = Schedules["plans"][number];

function SchedulerPage() {
  const { user, schedules: initialSchedules } = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const loadPlans = useServerFn(managedPlans);
  const markDay = useServerFn(planMarkDay);
  const [schedules, setSchedules] = useState<Schedules>(initialSchedules);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filteredStudents = schedules.students.filter((student) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return student.displayName.toLowerCase().includes(q) || student.username.toLowerCase().includes(q);
  });

  async function selectStudent(studentId: string) {
    setBusy(`student:${studentId}`);
    try {
      setSchedules(await loadPlans({ data: { studentId, autoSelect: true } }));
    } finally {
      setBusy(null);
    }
  }

  async function setFlexDay(plan: ManagedPlan, index: number, status: "off" | "sick") {
    setBusy(`${plan.enrollmentId}:${index}:${status}`);
    try {
      const updated = await markDay({ data: { enrollmentId: plan.enrollmentId, programKey: plan.programKey, programTitle: plan.programTitle, index, status } });
      setSchedules((current) => ({
        ...current,
        plans: current.plans.map((item) =>
          item.enrollmentId === plan.enrollmentId
            ? { ...item, ...updated, studentId: item.studentId, studentName: item.studentName }
            : item,
        ),
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminParentShell
      user={user}
      active="scheduler"
      onLogout={async () => { await doLogout({}); navigate({ to: "/" }); }}
    >
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 26px 60px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Study Plan</h1>
            <p style={{ color: "var(--a-muted)", fontWeight: 600, margin: "4px 0 0", fontSize: 14 }}>
              Assignment calendar, catch-up days, exam markers, and plan pacing.
            </p>
          </div>
          <div className="segmented">
            <button className="active">45 days</button>
            <button>60 days</button>
            <button>90 days</button>
          </div>
        </div>

        <section className="a-card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Students</h2>
              <p style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5, margin: 0 }}>{schedules.students.length} associated student{schedules.students.length === 1 ? "" : "s"}</p>
            </div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student" style={selectorInput} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filteredStudents.map((student) => {
              const active = schedules.selectedStudentId === student.id;
              return (
                <button key={student.id} onClick={() => selectStudent(student.id)} disabled={busy === `student:${student.id}`} style={studentButton(active)}>
                  <span style={{ display: "block", fontWeight: 900 }}>{student.displayName}</span>
                  <span style={{ display: "block", color: active ? "var(--a-accent)" : "var(--a-muted)", fontWeight: 800, fontSize: 11.5 }}>{busy === `student:${student.id}` ? "Loading..." : active ? "Selected" : `@${student.username}`}</span>
                </button>
              );
            })}
          </div>
        </section>

        {schedules.plans.length === 0 ? (
          <section className="a-card" style={{ padding: 28, color: "var(--a-faint)", fontWeight: 700 }}>
            {schedules.students.length === 0 ? "No active schedules yet." : "Select a student to load their study plan."}
          </section>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            {schedules.plans.map((plan) => (
              <section key={plan.enrollmentId} className="a-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontSize: 17, margin: "0 0 3px" }}>{plan.studentName}</h2>
                    <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5 }}>{plan.programTitle}</div>
                  </div>
                  <span className="pill" style={{ background: "var(--a-accent-soft)", color: "var(--a-accent)" }}>Day {plan.currentDay} / {plan.targetDays}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
                  <MiniMetric label="Streak" value={plan.streak} />
                  <MiniMetric label="Exams" value={plan.days.filter((d) => d.isExam).length} />
                  <MiniMetric label="Flex days" value={plan.days.filter((d) => d.status === "off" || d.status === "sick").length} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 7 }}>
                  {plan.days.slice(0, 42).map((day) => {
                    const tone = day.isExam ? "exam" : day.status === "off" || day.status === "sick" ? "soft" : day.index < plan.currentDay ? "done" : "todo";
                    return (
                      <div key={day.index} title={`${day.date} - ${day.title}`} style={dayBox(tone)}>
                        <span style={{ fontWeight: 900, fontSize: 11 }}>{day.index}</span>
                        <span style={{ fontWeight: 800, fontSize: 9 }}>{day.tag}</span>
                        {day.status === "scheduled" && (
                          <span style={{ display: "flex", gap: 3, marginTop: 3 }}>
                            <button onClick={() => setFlexDay(plan, day.index, "off")} disabled={!!busy} style={miniActionButton}>Off</button>
                            <button onClick={() => setFlexDay(plan, day.index, "sick")} disabled={!!busy} style={miniActionButton}>Sick</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </AdminParentShell>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#FAFBFD", border: "1px solid var(--a-border2)", borderRadius: 12, padding: 12 }}>
      <div style={{ color: "var(--a-faint)", fontWeight: 800, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 22 }}>{value}</div>
    </div>
  );
}

function dayBox(tone: "done" | "exam" | "soft" | "todo"): React.CSSProperties {
  const palette = {
    done: { bg: "var(--a-good-soft)", color: "var(--a-good)" },
    exam: { bg: "var(--a-accent-soft)", color: "var(--a-accent)" },
    soft: { bg: "var(--a-warn-soft)", color: "var(--a-warn)" },
    todo: { bg: "#F1F4F8", color: "var(--a-muted)" },
  }[tone];
  return {
    minHeight: 66,
    borderRadius: 10,
    background: palette.bg,
    color: palette.color,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  };
}

const selectorInput: React.CSSProperties = {
  width: "min(100%, 280px)",
  border: "1px solid var(--a-border)",
  borderRadius: 10,
  padding: "9px 11px",
  fontFamily: "inherit",
  fontWeight: 700,
  outline: "none",
};

function studentButton(active: boolean): React.CSSProperties {
  return {
    border: active ? "1px solid var(--a-accent)" : "1px solid var(--a-border)",
    background: active ? "var(--a-accent-soft)" : "#fff",
    color: "var(--a-ink)",
    borderRadius: 10,
    padding: "9px 12px",
    minWidth: 150,
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const miniActionButton: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,.08)",
  background: "#fff",
  color: "var(--a-muted)",
  borderRadius: 5,
  padding: "2px 4px",
  fontSize: 8.5,
  fontWeight: 900,
  cursor: "pointer",
};
