import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { NotificationBell } from "~/components/NotificationBell";
import { robuxRules, saveRobuxRules, rewardRulesList, saveRewardRule, adminRedemptions, adminApprove, adminFulfill } from "~/server/rpc/gamification";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/admin/rewards")({
  loader: async () => ({
    rules: await robuxRules({ data: { programKey: "grade3_staar" } }),
    rewards: await rewardRulesList(),
    redemptions: await adminRedemptions(),
    user: await me(),
  }),
  component: RewardsAdmin,
});

const STEPPERS: { key: "practiceCorrect" | "examCorrect" | "examWrong" | "lessonComplete"; label: string; sub: string }[] = [
  { key: "practiceCorrect", label: "Per correct practice answer", sub: "Awarded instantly while practicing" },
  { key: "examCorrect", label: "Per correct exam answer", sub: "Counts toward exam Robux" },
  { key: "examWrong", label: "Wrong-answer penalty", sub: "Deducted per wrong practice or exam answer" },
  { key: "lessonComplete", label: "Per lesson completed", sub: "Awarded on finishing a lesson" },
];

function RewardsAdmin() {
  const init = Route.useLoaderData();
  const navigate = useNavigate();
  const doSaveRobux = useServerFn(saveRobuxRules);
  const doSaveReward = useServerFn(saveRewardRule);
  const doApprove = useServerFn(adminApprove);
  const doFulfill = useServerFn(adminFulfill);
  const doLogout = useServerFn(logout);

  const [rules, setRules] = useState(init.rules);
  const [rewards, setRewards] = useState(init.rewards);
  const [redemptions, setRedemptions] = useState(init.redemptions);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState({ prize: "", kind: "complete_in_days" as "complete_in_days" | "streak" | "points", threshold: 45 });

  function step(key: keyof typeof rules, delta: number) {
    setRules((r) => ({ ...r, [key]: Math.max(0, r[key] + delta) }));
    setSaved(false);
  }
  async function saveRobux() {
    await doSaveRobux({ data: { programKey: "grade3_staar", rules } });
    setSaved(true);
  }
  async function addReward() {
    if (!draft.prize.trim()) return;
    setRewards(await doSaveReward({ data: { programKey: "grade3_staar", kind: draft.kind, threshold: draft.threshold, prize: draft.prize, status: "active" } }));
    setDraft({ prize: "", kind: draft.kind, threshold: draft.threshold });
  }

  return (
    <div className="a-shell">
      <header style={{ background: "var(--a-surface)", borderBottom: "1px solid var(--a-border)", padding: "14px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
        </div>
        <strong style={{ fontSize: 16 }}>Comet Console</strong>
        <nav style={{ display: "flex", gap: 14, marginLeft: 8, fontWeight: 700, fontSize: 13 }}>
          <Link to="/admin/content" style={{ color: "var(--a-muted)" }}>Content</Link>
          <span style={{ color: "var(--a-accent)" }}>Rewards</span>
          <Link to="/scoring" style={{ color: "var(--a-muted)" }}>Scoring</Link>
          <Link to="/dashboard" style={{ color: "var(--a-muted)" }}>Reports</Link>
          <Link to="/history" style={{ color: "var(--a-muted)" }}>History</Link>
          <Link to="/admin/profile" style={{ color: "var(--a-muted)" }}>Profile I/O</Link>
          <Link to="/billing" style={{ color: "var(--a-muted)" }}>Billing</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <NotificationBell tone="admin" />
        <span style={{ color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>{init.user?.displayName}</span>
        <button onClick={async () => { await doLogout({}); navigate({ to: "/" }); }} style={{ border: "1px solid var(--a-border)", background: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 9, cursor: "pointer" }}>Sign out</button>
      </header>

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 22px 60px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Robux earning rules */}
        <section className="a-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Robux earning rules</h2>
          <p style={{ margin: "0 0 16px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>Per-event point values — the single source of truth for earning. Separate from prize rules.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STEPPERS.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>{s.label}</div>
                  <div style={{ color: "var(--a-faint)", fontWeight: 600, fontSize: 11.5 }}>{s.sub}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => step(s.key, -5)} style={stepBtn}>−</button>
                  <span style={{ fontWeight: 800, fontSize: 17, width: 34, textAlign: "center" }}>{rules[s.key]}</span>
                  <button onClick={() => step(s.key, +5)} style={stepBtn}>+</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={saveRobux} style={{ marginTop: 16, border: "none", background: "var(--a-accent)", color: "#fff", fontWeight: 800, fontSize: 13.5, padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
            {saved ? "Saved ✓" : "Save earning rules"}
          </button>
        </section>

        {/* Reward (prize) rules */}
        <section className="a-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>Reward rules (prizes)</h2>
          <p style={{ margin: "0 0 16px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>Milestone prizes by complete-in-days / streak / points.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {rewards.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--a-border2)", borderRadius: 10, padding: "10px 12px" }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, flex: 1 }}>{r.prizeName ?? r.prize}</span>
                <span style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>{(r.targetType ?? r.kind ?? "complete_in_days").toLowerCase().replace(/_/g, " ")} · {r.targetValue ?? r.threshold}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={draft.prize} onChange={(e) => setDraft((d) => ({ ...d, prize: e.target.value }))} placeholder="Prize (e.g. New bike)" style={inputStyle} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as typeof d.kind }))} style={{ ...inputStyle, flex: 1 }}>
                <option value="complete_in_days">Complete in days</option>
                <option value="streak">Streak</option>
                <option value="points">Points</option>
              </select>
              <input type="number" value={draft.threshold} onChange={(e) => setDraft((d) => ({ ...d, threshold: Number(e.target.value) }))} style={{ ...inputStyle, width: 90 }} />
            </div>
            <button onClick={addReward} style={{ border: "1px solid var(--a-border)", background: "#fff", fontWeight: 800, fontSize: 13, padding: "9px", borderRadius: 10, cursor: "pointer" }}>+ Add reward rule</button>
          </div>
        </section>

        {/* Pending redemptions */}
        <section className="a-card" style={{ padding: 20, gridColumn: "1 / -1" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Redemptions to fulfill</h2>
          {redemptions.length === 0 ? (
            <p style={{ color: "var(--a-faint)", fontWeight: 600, fontSize: 13 }}>No pending redemption requests.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {redemptions.map((r) => (
                <RedemptionRow key={r.id} r={r}
                  onApprove={async () => setRedemptions(await doApprove({ data: { id: r.id } }))}
                  onFulfill={async (amt) => setRedemptions(await doFulfill({ data: { id: r.id, amount: amt } }))} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function RedemptionRow({ r, onApprove, onFulfill }: { r: { id: string; item: string; amountRequested: number; amountFulfilled: number; status: string; available: number }; onApprove: () => void; onFulfill: (amt: number) => void }) {
  const remaining = r.amountRequested - r.amountFulfilled;
  const [amt, setAmt] = useState(Math.min(remaining, r.available));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--a-border2)", borderRadius: 10, padding: "12px 14px", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{r.item}</div>
        <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>requested {r.amountRequested} · fulfilled {r.amountFulfilled} · available {r.available}</div>
      </div>
      <span className="pill" style={{ background: r.status === "approved" ? "var(--a-good-soft)" : "var(--a-warn-soft)", color: r.status === "approved" ? "var(--a-good)" : "var(--a-warn)" }}>{r.status}</span>
      {r.status === "requested" && <button onClick={onApprove} style={{ border: "1px solid var(--a-border)", background: "#fff", fontWeight: 800, fontSize: 12.5, padding: "8px 12px", borderRadius: 9, cursor: "pointer" }}>Approve</button>}
      {r.status === "approved" && (
        <>
          <input type="number" value={amt} onChange={(e) => setAmt(Number(e.target.value))} style={{ ...inputStyle, width: 80 }} />
          <button onClick={() => onFulfill(amt)} style={{ border: "none", background: "var(--a-good)", color: "#fff", fontWeight: 800, fontSize: 12.5, padding: "8px 12px", borderRadius: 9, cursor: "pointer" }}>Fulfill</button>
        </>
      )}
    </div>
  );
}

const stepBtn: React.CSSProperties = { width: 30, height: 30, border: "1px solid var(--a-border)", background: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 800, fontSize: 16 };
const inputStyle: React.CSSProperties = { padding: "9px 11px", border: "1px solid var(--a-border)", borderRadius: 10, fontFamily: "inherit", fontSize: 13.5, outline: "none" };
