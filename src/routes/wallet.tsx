import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { myWallet, requestRedeem } from "~/server/rpc/gamification";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/wallet")({
  loader: () => myWallet(),
  component: WalletPage,
});

type WalletData = Extract<Awaited<ReturnType<typeof myWallet>>, { available: true }>;

function WalletPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const doRedeem = useServerFn(requestRedeem);
  const doLogout = useServerFn(logout);
  const [state, setState] = useState<WalletData | null>(data.available ? data : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);

  async function redeem(item: string, cost: number) {
    if (!state || busy) return;
    setBusy(item);
    const wallet = await doRedeem({ data: { enrollmentId: state.enrollmentId, item, amount: cost } });
    setState({ ...state, wallet });
    setBusy(null);
  }

  const w = state?.wallet;

  return (
    <div style={{ minHeight: "100vh", background: "var(--s-bg)", fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: "var(--s-surface)", borderBottom: "1px solid #EFE7DA", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
        </div>
        <strong style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, color: "var(--s-ink)" }}>Comet Academy</strong>
        <nav style={{ display: "flex", gap: 14, marginLeft: 14, fontWeight: 800, fontSize: 13.5 }}>
          <Link to="/student" style={{ color: "var(--a-muted)" }}>Home</Link>
          <Link to="/practice" style={{ color: "var(--a-muted)" }}>Practice</Link>
          <span style={{ color: "var(--s-primary-ink)" }}>Wallet</span>
        </nav>
        <div style={{ flex: 1 }} />
        <button onClick={async () => { await doLogout({}); navigate({ to: "/" }); }} style={{ border: "1px solid #EFE7DA", background: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 9, cursor: "pointer", color: "var(--s-ink)" }}>Sign out</button>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px 60px" }}>
        <h1 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 32, margin: "0 0 18px", letterSpacing: "-.5px" }}>My Robux Wallet</h1>

        {!w ? (
          <p style={{ color: "var(--s-muted)", fontWeight: 700 }}>No active enrollment yet.</p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
              <Stat label="Available to spend" value={w.available} color="var(--s-robux)" />
              <Stat label="Lifetime earned" value={w.lifetime} color="var(--s-primary)" />
            </div>

            <div style={{ background: "linear-gradient(135deg,#6C4CE0,#2FA7E0)", color: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 10px 26px rgba(108,76,224,.18)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 24 }}>Spend Robux</div>
                <div style={{ fontWeight: 700, fontSize: 14, opacity: 0.92 }}>Pick a reward and send it for grown-up approval.</div>
              </div>
              <button onClick={() => setRedeemOpen(true)} style={{ border: "none", cursor: "pointer", background: "#fff", color: "var(--s-primary-ink)", fontWeight: 900, fontSize: 15, padding: "13px 20px", borderRadius: 14, fontFamily: "inherit" }}>
                Redeem Robux
              </button>
            </div>

            {redeemOpen && (
              <Modal onClose={() => setRedeemOpen(false)}>
                <h3 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 22, margin: "0 0 4px", color: "var(--s-ink)" }}>Redeem Robux</h3>
                <p style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 14, margin: "0 0 16px" }}>
                  You have <b style={{ color: "var(--s-robux)" }}>{w.available} Robux</b> to spend. A grown-up approves your pick.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
                  {w.catalog.map((c) => {
                    const affordable = w.available >= c.cost;
                    return (
                      <div key={c.item} style={{ border: "2px solid #ECE7F4", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--s-ink)" }}>{c.item}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 13, color: "#9C6A00" }}>
                          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--s-robux)" }} /> {c.cost} Robux
                        </div>
                        <button onClick={() => redeem(c.item, c.cost)} disabled={!affordable || busy === c.item}
                          style={{ border: "none", cursor: affordable ? "pointer" : "not-allowed", background: affordable ? "var(--s-primary)" : "#E7E2F2", color: affordable ? "#fff" : "var(--s-muted)", fontWeight: 800, fontSize: 13.5, padding: "10px", borderRadius: 11, fontFamily: "inherit" }}>
                          {busy === c.item ? "Requesting..." : affordable ? "Request approval" : "Not enough"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Modal>
            )}

            {/* Big goals & rewards */}
            <Card title="Big goals & rewards 🏆">
              {state!.rewards.length === 0 ? (
                <p style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 14, margin: 0 }}>No reward goals set yet — ask a grown-up to add one!</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {state!.rewards.map((r, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
                        <span>{r.prizeName} {r.met ? "🎉" : ""}</span>
                        <span style={{ color: r.expired ? "var(--a-bad)" : r.paused ? "var(--a-warn)" : "var(--s-muted)", fontWeight: 700, fontSize: 12.5 }}>
                          {r.targetType.toLowerCase().replace(/_/g, " ")} · {r.targetValue}
                        </span>
                      </div>
                      <div style={{ color: "var(--s-muted)", fontWeight: 800, fontSize: 13, marginBottom: 7 }}>
                        {r.message}
                      </div>
                      <div style={{ height: 12, background: "#EEE9F6", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(r.progress * 100)}%`, height: "100%", background: r.met ? "var(--s-success)" : r.expired ? "var(--a-bad)" : r.paused ? "var(--a-warn)" : "var(--s-primary)", borderRadius: 999 }} />
                      </div>
                      <div style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 12, marginTop: 5 }}>{r.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* My requests + earn history */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card title="My redemptions">
                {w.redemptions.length === 0 ? <Empty /> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {w.redemptions.map((r) => (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
                        <span>{r.item}</span>
                        <span style={{ color: r.status === "fulfilled" ? "var(--s-success)" : "var(--s-muted)" }}>{r.status}{r.amountFulfilled ? ` (${r.amountFulfilled}/${r.amountRequested})` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Robux history">
                {w.history.length === 0 ? <Empty /> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {w.history.slice(0, 8).map((h, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13.5 }}>
                        <span style={{ color: "var(--s-muted)" }}>{h.desc}</span>
                        <span style={{ color: h.amount >= 0 ? "var(--s-success)" : "var(--a-bad)" }}>{h.amount >= 0 ? "+" : ""}{h.amount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--s-surface)", borderRadius: 22, padding: 22, boxShadow: "0 8px 22px rgba(54,48,74,.06)" }}>
      <div style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 13 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", background: color }} />
        <span style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 34 }}>{value}</span>
        <span style={{ fontWeight: 800, color: "var(--s-muted)", fontSize: 15 }}>Robux</span>
      </div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--s-surface)", borderRadius: 22, padding: 22, boxShadow: "0 8px 22px rgba(54,48,74,.06)", marginBottom: 16 }}>
      <h3 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 18, margin: "0 0 12px" }}>{title}</h3>
      {children}
    </div>
  );
}
function Empty() {
  return <p style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 13.5, margin: 0 }}>Nothing yet.</p>;
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(54,48,74,.38)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, padding: 24, width: "100%", maxWidth: 760, maxHeight: "86vh", overflow: "auto", boxShadow: "0 24px 70px rgba(54,48,74,.26)" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -4 }}>
          <button onClick={onClose} style={{ border: "none", background: "#F1EDF8", color: "var(--s-muted)", width: 32, height: 32, borderRadius: 10, cursor: "pointer", fontWeight: 900 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
