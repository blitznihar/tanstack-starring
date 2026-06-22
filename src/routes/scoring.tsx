import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminParentShell } from "~/components/AppShell";
import { SourceBadge } from "~/components/SourceBadge";
import { scoringQueue, setWrittenScore } from "~/server/rpc/scoring";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/scoring")({
  loader: async () => ({ rows: await scoringQueue(), user: await me() }),
  component: ScoringQueue,
});

type Row = Awaited<ReturnType<typeof scoringQueue>>[number];

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  manual: { label: "Needs review", bg: "var(--a-bad-soft)", color: "var(--a-bad)" },
  pending: { label: "Queued", bg: "var(--a-warn-soft)", color: "var(--a-warn)" },
  scoring: { label: "Scoring…", bg: "var(--a-warn-soft)", color: "var(--a-warn)" },
  scored: { label: "AI scored", bg: "var(--a-good-soft)", color: "var(--a-good)" },
  overridden: { label: "Set by grown-up", bg: "var(--a-accent-soft)", color: "var(--a-accent)" },
};

function ScoringQueue() {
  const { rows: initial, user } = Route.useLoaderData();
  const navigate = useNavigate();
  const doSet = useServerFn(setWrittenScore);
  const doLogout = useServerFn(logout);

  const [rows, setRows] = useState<Row[]>(initial);

  async function override(jobId: string, score: number) {
    const updated = await doSet({ data: { jobId, score } });
    setRows((rs) => rs.map((r) => (r.jobId === jobId ? { ...r, ...updated } : r)));
  }

  return (
    <AdminParentShell
      user={user}
      active="scoring"
      onLogout={async () => { await doLogout({}); navigate({ to: "/" }); }}
    >
      <main style={{ maxWidth: 880, margin: "0 auto", padding: "28px 22px 60px" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Written-response scoring</h1>
        <p style={{ color: "var(--a-muted)", fontWeight: 600, marginTop: 0 }}>
          The local model scores SCR/ECR answers automatically. Anything it can't reach lands here for review — and you can set the final score one click.
        </p>

        {rows.length === 0 ? (
          <div className="a-card" style={{ padding: 28, textAlign: "center", color: "var(--a-faint)", fontWeight: 700 }}>No written responses to score yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r) => <JobCard key={r.jobId} r={r} onOverride={override} />)}
          </div>
        )}
      </main>
    </AdminParentShell>
  );
}

function JobCard({ r, onOverride }: { r: Row; onOverride: (jobId: string, score: number) => Promise<void> }) {
  const st = STATUS[r.status] ?? STATUS.pending!;
  const [score, setScore] = useState<number>(r.score ?? 0);
  const [busy, setBusy] = useState(false);
  const pending = r.status === "pending" || r.status === "scoring";

  return (
    <section className="a-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{r.studentName}</span>
        <span style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 12 }}>{r.programTitle} · {r.itemType.toUpperCase()} · {r.teks}</span>
        <SourceBadge source={r.itemSource} />
        <span className="pill" style={{ marginLeft: "auto", background: st.bg, color: st.color }}>{st.label}</span>
      </div>

      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{r.prompt}</div>
      <div style={{ background: "#F4F6FA", border: "1px solid var(--a-border)", borderRadius: 10, padding: "11px 13px", fontWeight: 600, fontSize: 13.5, color: "var(--a-ink)", whiteSpace: "pre-wrap", marginBottom: 10 }}>
        {r.responseText.trim() ? r.responseText : "(left blank)"}
      </div>

      {r.status === "scored" && r.justification && (
        <div style={{ background: "var(--a-good-soft)", borderRadius: 10, padding: "10px 13px", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, color: "var(--a-good)" }}>AI suggests {r.score}/{r.maxPoints} · {r.source}</div>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--a-ink)" }}>{r.justification}</div>
          {r.tips.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontWeight: 700, fontSize: 12.5, color: "var(--a-muted)" }}>{r.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      )}
      {r.status === "overridden" && (
        <div style={{ background: "var(--a-accent-soft)", borderRadius: 10, padding: "10px 13px", marginBottom: 10, fontWeight: 700, fontSize: 13, color: "var(--a-accent)" }}>
          Final score set to {r.score}/{r.maxPoints}. {r.justification}
        </div>
      )}
      {r.status === "manual" && r.error && (
        <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 12, marginBottom: 10 }}>AI unavailable: {r.error}</div>
      )}

      {pending ? (
        <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 13 }}>The model is scoring this now…</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "var(--a-muted)" }}>Set final score:</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setScore((s) => Math.max(0, s - 1))} style={stepBtn}>−</button>
            <span style={{ fontWeight: 800, fontSize: 17, width: 54, textAlign: "center" }}>{score} / {r.maxPoints}</span>
            <button onClick={() => setScore((s) => Math.min(r.maxPoints, s + 1))} style={stepBtn}>+</button>
          </div>
          <button disabled={busy} onClick={async () => { setBusy(true); await onOverride(r.jobId, score); setBusy(false); }}
            style={{ border: "none", background: "var(--a-accent)", color: "#fff", fontWeight: 800, fontSize: 13, padding: "9px 16px", borderRadius: 10, cursor: "pointer" }}>
            {busy ? "Saving…" : "Set score"}
          </button>
        </div>
      )}
    </section>
  );
}

const stepBtn: React.CSSProperties = { width: 30, height: 30, border: "1px solid var(--a-border)", background: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 800, fontSize: 16 };
