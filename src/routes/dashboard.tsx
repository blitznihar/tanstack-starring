import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminParentShell } from "~/components/AppShell";
import { me, logout } from "~/server/rpc/session";
import { childOverview } from "~/server/rpc/reporting";

export const Route = createFileRoute("/dashboard")({
  loader: async () => {
    const user = await me();
    const isStaff = !!user?.roles.some((r) => r === "admin" || r === "super_admin");
    return { user, overview: await childOverview({ data: { autoSelect: !isStaff } }) };
  },
  component: Dashboard,
});

function Dashboard() {
  const { user, overview: initialOverview } = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const loadOverview = useServerFn(childOverview);
  const isAdmin = !!user?.roles.some((r) => r === "admin" || r === "super_admin");
  const [overview, setOverview] = useState(initialOverview);
  const [studentQuery, setStudentQuery] = useState("");
  const [loadingStudent, setLoadingStudent] = useState<string | null>(null);
  const [range, setRange] = useState<"day" | "week" | "month">("week");

  const reports = overview.available ? overview.perProgram : [];
  const primary = reports[0];
  const heatmap = reports.flatMap((p) => p.heatmap).slice(0, 12);
  const examTrend = reports.flatMap((p) => p.examTrend).slice(-5);
  const activity = reports.flatMap((p) => p.activity).slice(0, 6);
  const robuxHistory = reports.flatMap((p) => p.robuxHistory).slice(0, 5);
  const needsTotal = heatmap.filter((h) => h.state === "partial" || h.state === "not_mastered").length;
  const masteredTotal = overview.available ? overview.overall.topicsCompleted : 0;
  const filteredStudents = overview.students.filter((student) => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return true;
    return student.displayName.toLowerCase().includes(q) || student.username.toLowerCase().includes(q);
  });

  async function selectStudent(studentId: string) {
    setLoadingStudent(studentId);
    try {
      setOverview(await loadOverview({ data: { studentId, autoSelect: true } }));
    } finally {
      setLoadingStudent(null);
    }
  }

  return (
    <AdminParentShell
      user={user}
      active="reports"
      onLogout={async () => { await doLogout({}); navigate({ to: "/" }); }}
    >
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 26px 60px" }}>
        <StudentSelector
          students={filteredStudents}
          allCount={overview.students.length}
          query={studentQuery}
          selectedId={overview.available ? overview.studentId : ""}
          loadingId={loadingStudent}
          summaries={overview.studentSummaries}
          onQuery={setStudentQuery}
          onSelect={selectStudent}
        />

        {!overview.available ? (
          <section className="a-card" style={{ padding: 28, color: "var(--a-muted)", fontWeight: 700 }}>
            {overview.students.length === 0 ? "No student data yet." : "Search and select a student to load progress."}
          </section>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
              <div>
                <h1 style={{ fontSize: 27, fontWeight: 800, margin: 0, letterSpacing: 0 }}>{overview.studentName || "Student"}'s progress</h1>
                <p style={{ margin: "3px 0 0", color: "var(--a-muted)", fontWeight: 600, fontSize: 14 }}>A calm look at how things are going.</p>
              </div>
              <div className="segmented">
                {(["day", "week", "month"] as const).map((r) => (
                  <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>{r.charAt(0).toUpperCase() + r.slice(1)}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
              <Metric label="Skills mastered" value={`${masteredTotal}`} sub={`/ ${overview.overall.topicsTotal}`} />
              <Metric label="Needs work" value={String(needsTotal)} color="var(--a-warn)" />
              <Metric label="Day streak" value={String(primary?.streak ?? 0)} color="var(--a-accent)" />
              <Metric label="Robux available" value={String(overview.overall.availableRobux)} color="var(--a-warn)" />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "linear-gradient(135deg,#2F5BEA,#5B7BF0)", borderRadius: 16, padding: "18px 22px", marginBottom: 16, color: "#fff", flexWrap: "wrap" }}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flex: "none" }}>$</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Family plan · parent payment ready</div>
                <div style={{ fontWeight: 600, fontSize: 13, opacity: 0.9 }}>Trial/subscription status is available in Billing.</div>
              </div>
              <Link to="/billing" style={{ background: "#fff", color: "#2F5BEA", fontWeight: 800, fontSize: 14, padding: "11px 20px", borderRadius: 11 }}>Pay with credit card</Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
              <section className="a-card" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>TEKS mastery heatmap</h3>
                  <div style={{ display: "flex", gap: 12, fontSize: 11.5, fontWeight: 700, color: "var(--a-muted)" }}>
                    <Legend color="var(--a-good)" label="Mastered" />
                    <Legend color="var(--a-warn)" label="Approaching" />
                    <Legend color="var(--a-bad)" label="Needs work" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                  {heatmap.map((h) => {
                    const c = heatmapColor(h.state);
                    return (
                      <div key={h.code} style={{ background: c.soft, borderRadius: 12, padding: "14px 12px", minHeight: 86 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 13 }}>{h.code}</span>
                          <span style={{ width: 12, height: 12, borderRadius: 4, background: c.bg }} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 11, color: "var(--a-muted)", lineHeight: 1.35 }}>{h.label}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="a-card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 18px" }}>Exam scores over time</h3>
                {examTrend.length === 0 ? (
                  <EmptyLine>No exams taken yet.</EmptyLine>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, height: 160 }}>
                    {examTrend.map((e, i) => (
                      <div key={`${e.label}-${i}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: "var(--a-ink)" }}>{e.score}%</div>
                        <div style={{ width: "100%", maxWidth: 34, borderRadius: "8px 8px 0 0", background: trendColor(e.color), height: `${Math.max(12, e.score)}%` }} />
                        <div style={{ fontWeight: 700, fontSize: 11, color: "var(--a-faint)" }}>{e.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
              <section className="a-card" style={{ padding: 22 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 14px" }}>Activity log</h3>
                {activity.length === 0 ? <EmptyLine>No activity yet.</EmptyLine> : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {activity.map((a, i) => (
                      <div key={`${a.type}-${i}`} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid var(--a-border2)" }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--a-faint)", width: 48, flex: "none" }}>{a.date}</span>
                        <span style={{ fontWeight: 800, fontSize: 12, color: "var(--a-accent)", width: 70, flex: "none" }}>{a.type}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: "var(--a-ink)" }}>{a.detail}</span>
                        <span style={{ background: a.good ? "var(--a-good-soft)" : "var(--a-warn-soft)", color: a.good ? "var(--a-good)" : "var(--a-warn)", fontWeight: 800, fontSize: 12, padding: "3px 10px", borderRadius: 999 }}>{a.tag}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <section className="a-card" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>Robux history</h3>
                  {robuxHistory.length === 0 ? <EmptyLine>No Robux activity yet.</EmptyLine> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {robuxHistory.map((l, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ fontWeight: 600 }}>{l.desc}</span>
                          <span style={{ fontWeight: 800, color: l.amount >= 0 ? "var(--a-good)" : "var(--a-bad)" }}>{l.amount >= 0 ? "+" : ""}{l.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="a-card" style={{ padding: 22 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>Topics</h3>
                  <div style={{ display: "flex", gap: 12 }}>
                    <TopicBox value={overview.overall.topicsCompleted} label="done" good />
                    <TopicBox value={Math.max(0, overview.overall.topicsTotal - overview.overall.topicsCompleted)} label="remaining" />
                  </div>
                </section>
              </div>
            </div>

            {isAdmin && (
              <div style={{ marginTop: 18, color: "var(--a-muted)", fontWeight: 700, fontSize: 13 }}>
                Admin view: <Link to="/admin/console" style={{ color: "var(--a-accent)" }}>open the full console</Link>.
              </div>
            )}
          </>
        )}
      </main>
    </AdminParentShell>
  );
}

function StudentSelector({
  students,
  allCount,
  query,
  selectedId,
  loadingId,
  summaries,
  onQuery,
  onSelect,
}: {
  students: { id: string; displayName: string; username: string }[];
  allCount: number;
  query: string;
  selectedId: string;
  loadingId: string | null;
  summaries: { id: string; displayName: string; topicsCompleted: number; topicsTotal: number; availableRobux: number; programCount: number }[];
  onQuery: (value: string) => void;
  onSelect: (studentId: string) => Promise<void>;
}) {
  if (allCount === 0 || (selectedId && allCount <= 1 && summaries.length <= 1)) return null;
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  return (
    <section className="a-card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <SectionLabel title="Students" note={`${allCount} associated student${allCount === 1 ? "" : "s"}`} />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search student" style={{ ...selectorInput, maxWidth: 280 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}>
        {students.map((student) => {
          const summary = summaryById.get(student.id);
          const active = selectedId === student.id;
          return (
            <button key={student.id} onClick={() => onSelect(student.id)} disabled={loadingId === student.id} style={studentCardButton(active)}>
              <span style={{ display: "block", fontWeight: 900, fontSize: 14 }}>{student.displayName}</span>
              <span style={{ display: "block", color: "var(--a-muted)", fontWeight: 800, fontSize: 11.5 }}>@{student.username}</span>
              {summary && (
                <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, color: "var(--a-muted)", fontWeight: 800, fontSize: 11.5 }}>
                  <span>{summary.topicsCompleted}/{summary.topicsTotal} skills</span>
                  <span>{summary.availableRobux} Robux</span>
                  <span>{summary.programCount} program{summary.programCount === 1 ? "" : "s"}</span>
                </span>
              )}
              <span style={{ display: "block", marginTop: 10, color: active ? "var(--a-accent)" : "var(--a-faint)", fontWeight: 900, fontSize: 12 }}>
                {loadingId === student.id ? "Loading..." : active ? "Selected" : "View progress"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SectionLabel({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>{title}</h2>
      <p style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5, margin: 0 }}>{note}</p>
    </div>
  );
}

function Metric({ label, value, sub, color = "var(--a-ink)" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="a-card" style={{ padding: 18 }}>
      <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 30, marginTop: 4, color }}>{value}{sub && <span style={{ fontSize: 15, color: "var(--a-faint)" }}> {sub}</span>}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: color }} /> {label}</span>;
}

function heatmapColor(state: string) {
  if (state === "mastered") return { bg: "var(--a-good)", soft: "var(--a-good-soft)" };
  if (state === "partial") return { bg: "var(--a-warn)", soft: "var(--a-warn-soft)" };
  if (state === "not_mastered") return { bg: "var(--a-bad)", soft: "var(--a-bad-soft)" };
  return { bg: "#94A0B3", soft: "#F1F2F5" };
}

function trendColor(color: "good" | "warn" | "bad") {
  if (color === "good") return "var(--a-good)";
  if (color === "warn") return "var(--a-warn)";
  return "var(--a-bad)";
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 13 }}>{children}</div>;
}

function TopicBox({ value, label, good = false }: { value: number; label: string; good?: boolean }) {
  return (
    <div style={{ flex: 1, background: good ? "var(--a-good-soft)" : "#EDF0F5", borderRadius: 12, padding: 14, textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 26, color: good ? "#0E7A55" : "var(--a-muted)" }}>{value}</div>
      <div style={{ fontWeight: 700, fontSize: 12, color: good ? "#0E7A55" : "var(--a-muted)" }}>{label}</div>
    </div>
  );
}

const selectorInput: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--a-border)",
  borderRadius: 10,
  padding: "9px 11px",
  fontFamily: "inherit",
  fontWeight: 700,
  outline: "none",
};

function studentCardButton(active: boolean): React.CSSProperties {
  return {
    textAlign: "left",
    border: active ? "1px solid var(--a-accent)" : "1px solid var(--a-border2)",
    background: active ? "var(--a-accent-soft)" : "#fff",
    borderRadius: 10,
    padding: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
