import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AdminParentShell } from "~/components/AppShell";
import { managedPlans } from "~/server/rpc/schedule";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/admin/scheduler")({
  loader: async () => ({ user: await me(), schedules: await managedPlans() }),
  component: SchedulerPage,
});

function SchedulerPage() {
  const { user, schedules } = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);

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

        {schedules.plans.length === 0 ? (
          <section className="a-card" style={{ padding: 28, color: "var(--a-faint)", fontWeight: 700 }}>No active schedules yet.</section>
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
    minHeight: 48,
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
