import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminParentShell } from "~/components/AppShell";
import { billingOverview, savePlanPrice, saveDemoPolicy, subscribePlan, payInvoiceFn } from "~/server/rpc/billing";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/billing")({
  validateSearch: (s: Record<string, unknown>): { checkout?: string } => (typeof s.checkout === "string" ? { checkout: s.checkout } : {}),
  loader: async () => ({ user: await me(), overview: await billingOverview() }),
  component: Billing,
});

type Overview = Awaited<ReturnType<typeof billingOverview>>;
type Interval = "month" | "year";
const fmt = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

function Billing() {
  const { user, overview: initial } = Route.useLoaderData();
  const { checkout } = Route.useSearch();
  const navigate = useNavigate();
  const doOverview = useServerFn(billingOverview);
  const doSavePrice = useServerFn(savePlanPrice);
  const doSaveDemo = useServerFn(saveDemoPolicy);
  const doSubscribe = useServerFn(subscribePlan);
  const doPay = useServerFn(payInvoiceFn);
  const doLogout = useServerFn(logout);

  const [ov, setOv] = useState<Overview>(initial);
  const [interval, setInterval] = useState<Interval>(ov.interval === "year" ? "year" : "month");
  const [subModal, setSubModal] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<{ context: "subscribe" | "invoice"; planId?: string; amountCents: number; label: string } | null>(null);
  const [card, setCard] = useState({ name: "", number: "", exp: "", cvc: "" });
  const [payDone, setPayDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setOv(await doOverview({}));
  const planById = (id: string) => ov.plans.find((p) => p.id === id);
  const priceAt = (p: Overview["plans"][number]) => (interval === "year" ? p.yearlyCents : p.monthlyCents);

  const cardValid =
    card.name.trim() !== "" && card.number.replace(/\s/g, "").length >= 15 && card.exp.length >= 4 && card.cvc.length >= 3;

  async function confirmPay() {
    if (!payModal) return;
    setBusy(true);
    try {
      const res =
        payModal.context === "subscribe" && payModal.planId
          ? await doSubscribe({ data: { planId: payModal.planId, interval } })
          : await doPay({ data: { amountCents: payModal.amountCents, description: payModal.label } });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl; // Stripe-hosted Checkout
        return;
      }
      setPayDone(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  function closePay() {
    setPayModal(null);
    setPayDone(false);
    setCard({ name: "", number: "", exp: "", cvc: "" });
  }

  async function stepPrice(planId: string, deltaCents: number) {
    const p = planById(planId);
    if (!p) return;
    setOv(await doSavePrice({ data: { planId, priceCents: Math.max(0, p.priceCents + deltaCents) } }));
  }
  async function saveDemo(next: { lengthDays: number; unlimited: boolean; programKeys: string[] }) {
    setOv(await doSaveDemo({ data: next }));
  }

  const dp = ov.demoPolicy;
  const invoiceAmount = ov.currentPlanId ? priceAt(ov.plans.find((p) => p.id === ov.currentPlanId)!) : (ov.plans[0] ? ov.plans[0].monthlyCents : 1900);
  const demo = ov.access.demo;

  return (
    <AdminParentShell
      user={user}
      active="billing"
      onLogout={async () => { await doLogout({}); navigate({ to: "/" }); }}
    >
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 22px 60px" }}>
        {checkout === "success" && (
          <div style={{ background: "var(--a-good-soft)", color: "var(--a-good)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontWeight: 700, fontSize: 13.5 }}>
            ✅ Checkout complete — your subscription activates once Stripe confirms the payment.
          </div>
        )}
        {checkout === "cancel" && (
          <div style={{ background: "var(--a-warn-soft)", color: "var(--a-warn)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, fontWeight: 700, fontSize: 13.5 }}>
            Checkout canceled — no charge was made.
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Plans &amp; billing</h1>
            <p style={{ margin: "4px 0 0", color: "var(--a-muted)", fontWeight: 600, fontSize: 13.5 }}>
              Current: <b style={{ color: "var(--a-ink)" }}>{ov.currentPlanName ? `${ov.currentPlanName} · ${ov.subscriptionStatus}` : "No plan — on free trial"}</b>
              {ov.mode === "demo" && <span className="pill" style={{ marginLeft: 10, background: "var(--a-warn-soft)", color: "var(--a-warn)" }}>demo mode — no real charge</span>}
            </p>
          </div>
          <div style={{ display: "flex", background: "#EDF0F5", borderRadius: 11, padding: 3 }}>
            {(["month", "year"] as Interval[]).map((iv) => (
              <button key={iv} onClick={() => setInterval(iv)} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "8px 16px", borderRadius: 9, background: interval === iv ? "#fff" : "transparent", color: interval === iv ? "var(--a-accent)" : "var(--a-muted)" }}>
                {iv === "month" ? "Monthly" : "Yearly · 2 mo free"}
              </button>
            ))}
          </div>
        </div>

        {ov.isSuper && (
          <div style={{ background: "var(--a-ink)", color: "#fff", borderRadius: 12, padding: "12px 16px", margin: "12px 0 16px", fontWeight: 700, fontSize: 13 }}>
            Super Admin — set prices with the +/− steppers on each plan and configure the demo period below.
          </div>
        )}

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, margin: "12px 0 18px" }}>
          {ov.plans.map((p) => {
            const isCurrent = p.id === ov.currentPlanId;
            return (
              <div key={p.id} style={{ background: "#fff", border: isCurrent ? "2px solid var(--a-accent)" : "1px solid var(--a-border)", borderRadius: 16, padding: 22, display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3, margin: "8px 0 4px" }}>
                  <span style={{ fontWeight: 800, fontSize: 32, color: "var(--a-ink)" }}>{fmt(priceAt(p))}</span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--a-faint)" }}>{interval === "year" ? "/yr" : "/mo"}</span>
                </div>
                {ov.canManagePricing && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 11.5, color: "var(--a-faint)" }}>Base $/mo</span>
                    <button onClick={() => stepPrice(p.id, -100)} style={stepBtn}>−</button>
                    <span style={{ fontWeight: 800, fontSize: 14, width: 34, textAlign: "center" }}>{fmt(p.monthlyCents)}</span>
                    <button onClick={() => stepPrice(p.id, 100)} style={stepBtn}>+</button>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 7, margin: "6px 0 16px", flex: 1 }}>
                  {p.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontWeight: 600, fontSize: 13, color: "var(--a-ink)" }}>
                      <span style={{ color: "var(--a-good)", fontWeight: 800 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <button
                  disabled={isCurrent || !ov.canManage}
                  onClick={() => setSubModal(p.id)}
                  style={{ border: "none", cursor: isCurrent || !ov.canManage ? "default" : "pointer", fontFamily: "inherit", background: isCurrent ? "var(--a-good-soft)" : ov.canManage ? "var(--a-accent)" : "#E7EBF1", color: isCurrent ? "#0E7A55" : ov.canManage ? "#fff" : "var(--a-faint)", fontWeight: 800, fontSize: 14, padding: 11, borderRadius: 10 }}>
                  {isCurrent ? "Current plan ✓" : ov.canManage ? `Choose ${p.name}` : "Plan"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Demo / trial config (super admin) */}
        {ov.canConfigureDemo && (
          <div style={{ background: "#fff", border: "1px solid var(--a-border)", borderRadius: 16, padding: 22, marginBottom: 18 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>Demo / trial period</h3>
            <p style={{ margin: "0 0 16px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>
              How long the free trial lasts and which programs it unlocks. {dp.unlimited ? "Unlimited demo" : `${dp.lengthDays}-day demo`} · {dp.programKeys.length} program(s).
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--a-faint)" }}>LENGTH</span>
              {[7, 14, 30, 60].map((d) => {
                const active = !dp.unlimited && dp.lengthDays === d;
                return (
                  <button key={d} onClick={() => saveDemo({ lengthDays: d, unlimited: false, programKeys: dp.programKeys })} style={{ cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--a-border)", background: active ? "var(--a-accent)" : "#fff", color: active ? "#fff" : "var(--a-muted)" }}>{d}d</button>
                );
              })}
              <button onClick={() => saveDemo({ lengthDays: dp.lengthDays, unlimited: !dp.unlimited, programKeys: dp.programKeys })} style={{ cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 13, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--a-border)", background: dp.unlimited ? "var(--a-accent)" : "#fff", color: dp.unlimited ? "#fff" : "var(--a-muted)" }}>Unlimited</button>
            </div>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--a-faint)", marginBottom: 10 }}>PROGRAMS AVAILABLE DURING DEMO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {ov.programs.map((pr) => {
                const on = dp.programKeys.includes(pr.key);
                const next = on ? dp.programKeys.filter((k) => k !== pr.key) : [...dp.programKeys, pr.key];
                return (
                  <div key={pr.key} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FAFBFD", border: "1px solid var(--a-border2)", borderRadius: 11, padding: "11px 15px" }}>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{pr.title}</span>
                    <button onClick={() => saveDemo({ lengthDays: dp.lengthDays, unlimited: dp.unlimited, programKeys: next })} style={{ border: "none", cursor: "pointer", width: 44, height: 26, borderRadius: 999, background: on ? "var(--a-accent)" : "#CBD3DF", position: "relative", flex: "none" }}>
                      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left .15s ease" }} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Access summary */}
        <div style={{ background: "#fff", border: "1px solid var(--a-border)", borderRadius: 16, padding: 22, marginBottom: 18 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>Program access</h3>
          <p style={{ margin: "0 0 14px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>
            {demo.unlimited ? "Unlimited demo active." : demo.active ? `Trial active — ${demo.daysLeft} day(s) left.` : "Trial ended."} Programs unlock by subscription or demo.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ov.access.byProgram.map((r) => (
              <span key={r.programKey} className="pill" style={{ background: r.unlocked ? "var(--a-good-soft)" : "var(--a-bad-soft)", color: r.unlocked ? "var(--a-good)" : "var(--a-bad)" }}>
                {ov.programTitleByKey[r.programKey] ?? r.programKey}{r.unlocked ? ` · ${r.via}` : " · locked"}
              </span>
            ))}
          </div>
        </div>

        {/* Parent: pay an invoice by card */}
        {ov.canPay && !ov.canManage && (
          <div style={{ background: "var(--a-accent)", color: "#fff", borderRadius: 16, padding: 22, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{ov.currentPlanName ? `${ov.currentPlanName} — current invoice` : "Family plan — invoice"}</div>
              <div style={{ fontWeight: 600, fontSize: 13, opacity: 0.9 }}>{fmt(invoiceAmount)} due</div>
            </div>
            <button onClick={() => setPayModal({ context: "invoice", amountCents: invoiceAmount, label: ov.currentPlanName ? `${ov.currentPlanName} — invoice` : "Family plan — invoice" })} style={{ border: "none", cursor: "pointer", fontFamily: "inherit", background: "#fff", color: "#2F5BEA", fontWeight: 800, fontSize: 14, padding: "11px 20px", borderRadius: 11 }}>
              Pay with credit card
            </button>
          </div>
        )}

        {/* Recent payments */}
        {ov.recentPayments.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid var(--a-border)", borderRadius: 16, padding: 22 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 12px" }}>Recent payments</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ov.recentPayments.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 13, color: "var(--a-ink)" }}>
                  <span>{p.description}</span>
                  <span><b>{fmt(p.amountCents)}</b> <span className="pill" style={{ background: "var(--a-border2)" }}>{p.status}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Subscribe confirm modal */}
      {subModal && (() => {
        const p = planById(subModal)!;
        return (
          <Modal onClose={() => setSubModal(null)}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>Subscribe to {p.name}</h3>
            <p style={{ margin: "0 0 16px", color: "var(--a-muted)", fontWeight: 600, fontSize: 14 }}>{fmt(priceAt(p))}{interval === "year" ? "/yr" : "/mo"} · {p.features.length} features · unlocks {p.programKeys.length} program(s).</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSubModal(null)} style={ghostBtn}>Cancel</button>
              <button onClick={() => { setPayModal({ context: "subscribe", planId: p.id, amountCents: priceAt(p), label: `${p.name} plan` }); setSubModal(null); setPayDone(false); }} style={primaryBtn}>Continue to payment</button>
            </div>
          </Modal>
        );
      })()}

      {/* Payment modal (shared) */}
      {payModal && (
        <Modal onClose={closePay}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Payment</h3>
            <span className="pill" style={{ background: "var(--s-primary-soft)", color: "var(--s-primary-ink)" }}>{fmt(payModal.amountCents)}{payModal.context === "subscribe" ? (interval === "year" ? "/yr" : "/mo") : ""}</span>
          </div>
          <p style={{ margin: "0 0 16px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>{payModal.label}</p>

          {payDone ? (
            <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
              <div style={{ fontSize: 34 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 16, margin: "8px 0 4px" }}>Payment complete</div>
              <div style={{ color: "var(--a-muted)", fontWeight: 600, fontSize: 13, marginBottom: 16 }}>{ov.mode === "demo" ? "Demo — no real charge was made." : "Thank you."}</div>
              <button onClick={closePay} style={{ ...primaryBtn, width: "100%" }}>Done</button>
            </div>
          ) : ov.mode === "stripe" ? (
            <div>
              <p style={{ color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>You'll be redirected to Stripe's secure checkout to enter your card. We never see your card details.</p>
              <button onClick={confirmPay} disabled={busy} style={{ ...primaryBtn, width: "100%", marginTop: 10 }}>{busy ? "Starting…" : "Continue to secure checkout"}</button>
            </div>
          ) : (
            <div>
              <label style={lbl}>Name on card</label>
              <input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Sam Rivera" style={inp} />
              <label style={lbl}>Card number</label>
              <input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^0-9 ]/g, "").slice(0, 19) })} placeholder="4242 4242 4242 4242" style={{ ...inp, fontFamily: "ui-monospace, Menlo, monospace" }} />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Expiry</label>
                  <input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value.replace(/[^0-9/]/g, "").slice(0, 5) })} placeholder="MM/YY" style={{ ...inp, fontFamily: "ui-monospace, Menlo, monospace" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>CVC</label>
                  <input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })} placeholder="123" style={{ ...inp, fontFamily: "ui-monospace, Menlo, monospace" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button onClick={closePay} style={ghostBtn}>Cancel</button>
                <button onClick={confirmPay} disabled={!cardValid || busy} style={{ ...primaryBtn, flex: 1, background: cardValid ? "var(--a-accent)" : "#CBD3DF" }}>{busy ? "Paying…" : `Pay ${fmt(payModal.amountCents)}${payModal.context === "subscribe" ? (interval === "year" ? "/yr" : "/mo") : ""}`}</button>
              </div>
              <div style={{ textAlign: "center", marginTop: 12, fontWeight: 600, fontSize: 11.5, color: "var(--a-faint)" }}>🔒 Secured · this is a demo — no real charge</div>
            </div>
          )}
        </Modal>
      )}
    </AdminParentShell>
  );
}

const stepBtn: React.CSSProperties = { border: "1px solid var(--a-border)", background: "#FAFBFD", cursor: "pointer", width: 26, height: 26, borderRadius: 7, fontWeight: 800, fontSize: 15, color: "var(--a-muted)" };
const lbl: React.CSSProperties = { fontWeight: 700, fontSize: 12, color: "var(--a-muted)", display: "block" };
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", margin: "6px 0 12px", padding: "11px 13px", border: "1px solid var(--a-border)", borderRadius: 10, fontFamily: "inherit", fontSize: 14, outline: "none" };
const primaryBtn: React.CSSProperties = { border: "none", cursor: "pointer", fontFamily: "inherit", background: "var(--a-accent)", color: "#fff", fontWeight: 800, fontSize: 14, padding: "11px 18px", borderRadius: 11 };
const ghostBtn: React.CSSProperties = { border: "1px solid var(--a-border)", cursor: "pointer", fontFamily: "inherit", background: "#fff", color: "var(--a-ink)", fontWeight: 800, fontSize: 14, padding: "11px 18px", borderRadius: 11 };

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,46,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 26, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        {children}
      </div>
    </div>
  );
}
