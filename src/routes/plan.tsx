import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { myPlans, planMarkDay, planWorkAhead } from "~/server/rpc/schedule";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/plan")({
  loader: () => myPlans(),
  component: PlanPage,
});

type Plan = Awaited<ReturnType<typeof myPlans>>["plans"][number];

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  EXAM: { bg: "var(--a-warn-soft)", color: "#9C6A00" },
  SICK: { bg: "var(--a-bad-soft)", color: "var(--a-bad)" },
  OFF: { bg: "#F1F2F5", color: "#5A6678" },
  ADDED: { bg: "var(--a-accent-soft)", color: "var(--a-accent)" },
  LESSON: { bg: "var(--s-primary-soft)", color: "var(--s-primary-ink)" },
};
const weekday = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const dateLabel = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function PlanPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const doMark = useServerFn(planMarkDay);
  const doWorkAhead = useServerFn(planWorkAhead);
  const doLogout = useServerFn(logout);

  const [plans, setPlans] = useState<Plan[]>(data.plans);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

  const plan = plans[active];

  function replace(updated: Plan) {
    setPlans((ps) => ps.map((p) => (p.enrollmentId === updated.enrollmentId ? updated : p)));
  }
  async function mark(index: number, status: "off" | "sick") {
    if (!plan || busy) return;
    setBusy(true);
    replace(await doMark({ data: { enrollmentId: plan.enrollmentId, programKey: plan.programKey, programTitle: plan.programTitle, index, status } }));
    setBusy(false);
  }
  async function ahead() {
    if (!plan || busy) return;
    setBusy(true);
    replace(await doWorkAhead({ data: { enrollmentId: plan.enrollmentId, programKey: plan.programKey, programTitle: plan.programTitle, count: 1 } }));
    setBusy(false);
  }

  const examCount = plan?.days.filter((d) => d.isExam).length ?? 0;
  const lessonCount = plan?.days.filter((d) => !d.isExam && d.status !== "off" && d.status !== "sick").length ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--a-bg)", fontFamily: "'Manrope', sans-serif" }}>
      <header style={{ background: "var(--s-surface)", borderBottom: "1px solid #EFE7DA", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
        </div>
        <strong style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, color: "var(--s-ink)" }}>Comet Academy</strong>
        <nav style={{ display: "flex", gap: 14, marginLeft: 14, fontWeight: 800, fontSize: 13.5 }}>
          <span style={{ color: "var(--s-primary-ink)" }}>Study plan</span>
          <Link to="/practice" style={{ color: "var(--a-muted)" }}>Practice</Link>
          <Link to="/wallet" style={{ color: "var(--a-muted)" }}>Wallet</Link>
        </nav>
        <div style={{ flex: 1 }} />
        {plan && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--s-robux-soft)", color: "#B47900", fontWeight: 800, fontSize: 13, padding: "7px 13px", borderRadius: 999 }}>
            🔥 {plan.streak}-day streak
          </span>
        )}
        <button onClick={async () => { await doLogout({}); navigate({ to: "/" }); }} style={{ border: "1px solid #EFE7DA", background: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 9, cursor: "pointer", color: "var(--s-ink)" }}>Sign out</button>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 60px" }}>
        <h1 style={{ fontSize: 27, fontWeight: 800, margin: 0, letterSpacing: "-.4px" }}>Study plan</h1>
        <p style={{ margin: "4px 0 0", color: "var(--a-muted)", fontWeight: 600, fontSize: 14 }}>
          Progressive exams (each covers all topics done so far). Mark a day Off or Sick and the plan re-fits itself.
        </p>

        {/* program tabs */}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {plans.map((p, i) => (
            <button key={p.enrollmentId} onClick={() => setActive(i)}
              style={{ cursor: "pointer", background: i === active ? "var(--s-primary)" : "#fff", color: i === active ? "#fff" : "var(--a-ink)", border: i === active ? "none" : "1px solid var(--a-border)", borderRadius: 11, padding: "9px 15px", textAlign: "left" }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{p.programTitle}</div>
              <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.85 }}>target {p.targetDays} days</div>
            </button>
          ))}
        </div>

        {plan && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 18px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--a-faint)" }}>
                {plan.programTitle} · {lessonCount} lesson days · {examCount} progressive exams · target {plan.targetDays} days
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={ahead} disabled={busy} style={{ border: "1px solid var(--s-primary)", background: "var(--s-primary-soft)", color: "var(--s-primary-ink)", cursor: "pointer", fontWeight: 800, fontSize: 12.5, padding: "8px 13px", borderRadius: 9 }}>
                ⏩ Work ahead 1 day
              </button>
              <div style={{ display: "flex", gap: 12, fontSize: 12, fontWeight: 700, color: "var(--a-muted)" }}>
                <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--a-warn)" }} /> Exam</span>
                <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--a-bad)" }} /> Sick</span>
                <span><span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "var(--a-accent)" }} /> Added</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
              {plan.days.map((d) => {
                const tc = TAG_COLORS[d.tag] ?? { bg: "var(--s-primary-soft)", color: "var(--s-primary-ink)" };
                const bg = d.status === "off" ? "#F1F2F5" : d.status === "sick" ? "var(--a-bad-soft)" : d.isExam ? "var(--a-warn-soft)" : d.tag === "ADDED" ? "var(--a-accent-soft)" : "#fff";
                const border = d.status === "done" ? "1px solid var(--a-good)" : d.isExam ? "1px solid #F0DCB0" : d.tag === "ADDED" ? "1px dashed var(--a-accent)" : "1px solid var(--a-border)";
                return (
                  <div key={d.index} style={{ background: bg, border, borderRadius: 12, padding: 13, minHeight: 118, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                      <span style={{ fontWeight: 800, fontSize: 13 }}>{dateLabel(d.date)}</span>
                      <span style={{ fontWeight: 700, fontSize: 11, color: "var(--a-faint)" }}>{weekday(d.date)}</span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--a-ink)", lineHeight: 1.3 }}>{d.title}</div>
                    <div style={{ fontWeight: 600, fontSize: 11, color: "var(--a-muted)", marginTop: 3 }}>
                      {d.status === "done" ? "✓ done" : d.subject || (d.isExam ? "all topics so far" : "")}
                    </div>
                    {d.bumped && (
                      <span style={{ alignSelf: "flex-start", marginTop: 6, background: "var(--a-good-soft)", color: "#0E7A55", fontWeight: 800, fontSize: 10, padding: "2px 7px", borderRadius: 6 }}>
                        +{Math.round((d.workloadFactor - 1) * 100)}% load
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <span style={{ background: tc.bg, color: tc.color, fontWeight: 800, fontSize: 9.5, padding: "3px 7px", borderRadius: 6, letterSpacing: ".03em" }}>{d.tag}</span>
                      <div style={{ flex: 1 }} />
                      {d.status === "scheduled" && (
                        <>
                          <button onClick={() => mark(d.index, "off")} disabled={busy} style={{ border: "1px solid var(--a-border)", background: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 10, color: "var(--a-muted)", padding: "3px 7px", borderRadius: 6 }}>Off</button>
                          <button onClick={() => mark(d.index, "sick")} disabled={busy} style={{ border: "1px solid var(--a-border)", background: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 10, color: "var(--a-bad)", padding: "3px 7px", borderRadius: 6 }}>Sick</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
