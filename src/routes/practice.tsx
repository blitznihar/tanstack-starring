import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { completePractice, myPracticeSet, submitPractice } from "~/server/rpc/practice";
import { startExam } from "~/server/rpc/exam";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/practice")({
  validateSearch: (s: Record<string, unknown>): { subject?: string; lesson?: number } => ({
    subject: typeof s.subject === "string" ? s.subject : undefined,
    lesson: s.lesson === "1" || s.lesson === 1 ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ subject: search.subject ?? "math", lesson: search.lesson }),
  loader: ({ deps }) => {
    if (deps.lesson !== 1) throw redirect({ to: "/lesson", search: { subject: deps.subject } });
    return myPracticeSet({ data: { subject: deps.subject } });
  },
  component: PracticePage,
});

type Data = Awaited<ReturnType<typeof myPracticeSet>>;
type Feedback = Awaited<ReturnType<typeof submitPractice>>;
type Question = Extract<Data, { available: true }>["set"]["questions"][number];
type AnswerValue = string | string[] | Record<string, string>;

const SUBJECTS = [
  { key: "math", label: "Math", icon: "🔢" },
  { key: "rla", label: "English", icon: "📖" },
];

function hasValue(v: AnswerValue | undefined): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((x) => String(x).trim() !== "");
}

function answerValue(v: unknown): AnswerValue | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(String);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]));
  }
  return undefined;
}

function initialFeedback(data: Data): Record<string, Feedback> {
  return data.available ? (data.set.feedback as Record<string, Feedback>) : {};
}

function initialSelected(data: Data): Record<string, AnswerValue> {
  if (!data.available) return {};
  return Object.fromEntries(
    Object.entries(data.set.feedback)
      .map(([itemId, fb]) => [itemId, answerValue(fb.selected)] as const)
      .filter((entry): entry is readonly [string, AnswerValue] => entry[1] !== undefined),
  );
}

function formatRobuxDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${value} Robux`;
}

function PracticePage() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const doSubmit = useServerFn(submitPractice);
  const doCompletePractice = useServerFn(completePractice);
  const doStartExam = useServerFn(startExam);
  const doLogout = useServerFn(logout);

  const data = initial;
  const subject = search.subject ?? "math";
  const [launching, setLaunching] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, AnswerValue>>(() => initialSelected(initial));
  const [feedback, setFeedback] = useState<Record<string, Feedback>>(() => initialFeedback(initial));
  const [wallet, setWallet] = useState(initial.available ? initial.wallet.available : 0);
  const [pending, setPending] = useState<string | null>(null);
  const [completingPractice, setCompletingPractice] = useState(false);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [pop, setPop] = useState<number | null>(null);

  async function switchSubject(s: string) {
    if (s === subject) return;
    await navigate({ to: "/lesson", search: { subject: s } });
  }

  async function launchExam(label: string, opts: { kind: "progressive" | "mock"; splitPct?: Record<string, number>; totalItems: number; durationSeconds: number }) {
    setLaunching(label);
    try {
      const r = await doStartExam({ data: opts });
      navigate({ to: "/exam/$sessionId", params: { sessionId: r.sessionId } });
    } catch (e) {
      setLaunching(null);
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function check(itemId: string, enrollmentId: string) {
    const sel = selected[itemId];
    if (!hasValue(sel) || feedback[itemId] || pending) return;
    setPending(itemId);
    const fb = await doSubmit({ data: { enrollmentId, itemId, selected: sel } });
    setFeedback((f) => ({ ...f, [itemId]: fb }));
    const persisted = answerValue(fb.selected);
    if (persisted !== undefined) setSelected((s) => ({ ...s, [itemId]: persisted }));
    if (fb.awarded !== 0) {
      setWallet(fb.wallet.available);
      setPop(fb.awarded);
      setTimeout(() => setPop(null), 1400);
    }
    setPending(null);
  }

  async function finishPractice() {
    if (!data.available || completingPractice) return;
    const itemIds = data.set.questions.map((question) => question.itemId);
    if (itemIds.length === 0 || itemIds.some((itemId) => !feedback[itemId])) return;
    setCompletingPractice(true);
    setCompleteMessage(null);
    try {
      const report = await doCompletePractice({ data: { enrollmentId: data.enrollmentId, subject, itemIds } });
      setWallet(report.wallet.available);
      setCompleteMessage(`Practice submitted: ${report.right}/${report.solved} correct, ${formatRobuxDelta(report.earned)}. Report sent.`);
      await navigate({ to: "/student" });
    } catch (e) {
      setCompleteMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setCompletingPractice(false);
    }
  }

  const onSignOut = async () => { await doLogout({}); navigate({ to: "/" }); };

  const tester = (
    <div style={{ background: "var(--s-surface)", borderRadius: 22, padding: 22, boxShadow: "0 8px 22px rgba(54,48,74,.06)", marginTop: 16 }}>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, color: "var(--s-muted)", marginBottom: 16 }}>
        Ready for the real thing? Pick a full test in the exam tester.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { tag: "M", label: "Progressive Math Check", desc: "Covers every Math topic you've finished · 40 min", kind: "progressive" as const, splitPct: { math: 100, rla: 0 }, totalItems: 8, durationSeconds: 40 * 60 },
          { tag: "★", label: "Full STAAR Mock", desc: "Math + Reading 50/50 with a 5-min break · 60 min", kind: "mock" as const, totalItems: 10, durationSeconds: 60 * 60 },
        ].map((x) => (
          <button key={x.label} onClick={() => launchExam(x.label, x)} disabled={!!launching}
            style={{ display: "flex", alignItems: "center", gap: 15, textAlign: "left", cursor: launching ? "wait" : "pointer", border: "2px solid #E9E3F6", background: "#fff", borderRadius: 18, padding: "16px 18px" }}>
            <span style={{ width: 46, height: 46, borderRadius: 13, background: "var(--s-primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 18, color: "var(--s-primary-ink)" }}>{x.tag}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 18, color: "var(--s-ink)" }}>{launching === x.label ? "Building exam…" : x.label}</span>
              <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: "var(--s-muted)", marginTop: 2 }}>{x.desc}</span>
            </span>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--s-primary-ink)", flex: "none" }}>Start →</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Shell wallet={wallet} pop={pop} onSignOut={onSignOut}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 30, margin: 0, letterSpacing: "-.5px", color: "var(--s-ink)" }}>Practice 💡</h1>
          {data.available && (
            <div style={{ background: "var(--s-robux-soft)", color: "#9C6A00", fontWeight: 800, fontSize: 13.5, padding: "8px 13px", borderRadius: 999 }}>
              Earn up to {data.set.earnUpTo} Robux
            </div>
          )}
        </div>

        {/* Subject toggle — Math AND English at parity (§20.2/§20.3) */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {SUBJECTS.map((s) => (
            <button key={s.key} onClick={() => switchSubject(s.key)}
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderRadius: 999, padding: "9px 18px", fontWeight: 800, fontSize: 14,
                background: subject === s.key ? "var(--s-primary)" : "#fff", color: subject === s.key ? "#fff" : "var(--s-muted)",
                border: subject === s.key ? "2px solid var(--s-primary)" : "2px solid #ECE7F4" }}>
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        {!data.available ? (
          <div style={{ maxWidth: 640, margin: "20px auto", textAlign: "center", color: "var(--s-muted)", fontWeight: 700 }}>
            No practice items for this subject yet. Ask an admin to import a bundle.
          </div>
        ) : data.set.shownCount === 0 ? (
          <div style={{ background: "var(--s-surface)", borderRadius: 22, padding: 24, boxShadow: "0 8px 22px rgba(54,48,74,.06)", color: "var(--s-muted)", fontWeight: 800, lineHeight: 1.5 }}>
            {data.set.unlockedStandards.length === 0 ? (
              <>
                Complete today’s lesson before practicing this subject.
                <div><Link to="/lesson" search={{ subject }} style={lessonReturnLink}>Go to lesson</Link></div>
              </>
            ) : (
              "You have completed every available practice question for the lessons currently unlocked."
            )}
          </div>
        ) : (
          <>
            <p style={{ margin: "0 0 18px", color: "var(--s-muted)", fontWeight: 700, fontSize: 13.5 }}>
              Showing <b style={{ color: "var(--s-primary-ink)" }}>{data.set.shownCount}</b> practice questions today ·{" "}
              <b>{data.set.bankTotal}</b> source questions in the bank
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.set.questions.map((q) => (
                <QuestionCard key={q.itemId} q={q} fb={feedback[q.itemId]} value={selected[q.itemId]}
                  subject={subject}
                  pending={pending === q.itemId}
                  onChange={(v) => setSelected((s) => ({ ...s, [q.itemId]: v }))}
                  onCheck={() => check(q.itemId, data.enrollmentId)} />
              ))}
            </div>
            <div style={{ background: "var(--s-surface)", borderRadius: 22, padding: 22, boxShadow: "0 8px 22px rgba(54,48,74,.06)", marginTop: 16 }}>
              <button
                onClick={finishPractice}
                disabled={completingPractice || data.set.questions.some((q) => !feedback[q.itemId])}
                style={{
                  width: "100%",
                  border: "none",
                  cursor: completingPractice ? "wait" : data.set.questions.some((q) => !feedback[q.itemId]) ? "default" : "pointer",
                  background: data.set.questions.some((q) => !feedback[q.itemId]) ? "var(--s-bg)" : "var(--s-primary)",
                  color: data.set.questions.some((q) => !feedback[q.itemId]) ? "var(--s-muted)" : "#fff",
                  fontFamily: "'Baloo 2', sans-serif",
                  fontWeight: 800,
                  fontSize: 17,
                  padding: 15,
                  borderRadius: 16,
                }}
              >
                {completingPractice ? "Submitting practice..." : "Complete Practice"}
              </button>
              {completeMessage && (
                <div style={{ marginTop: 12, color: completeMessage.startsWith("Practice submitted") ? "#0E7A55" : "#C2491F", fontWeight: 900, fontSize: 13.5 }}>
                  {completeMessage}
                </div>
              )}
            </div>
          </>
        )}

        {tester}
      </div>
    </Shell>
  );
}

function QuestionCard({ q, fb, value, subject, pending, onChange, onCheck }: {
  q: Question;
  fb: Feedback | undefined;
  value: AnswerValue | undefined;
  subject: string;
  pending: boolean;
  onChange: (v: AnswerValue) => void;
  onCheck: () => void;
}) {
  const checked = !!fb;
  return (
    <div style={{ background: "var(--s-surface)", borderRadius: 22, padding: 24, boxShadow: "0 8px 22px rgba(54,48,74,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--s-primary-soft)", color: "var(--s-primary-ink)", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{q.num}</span>
        <span style={{ fontWeight: 800, fontSize: 12, color: "var(--s-muted)" }}>{q.teks}</span>
      </div>

      {q.passage && (
        <div style={{ background: "#FBF9F4", border: "1px solid #ECE2CF", borderRadius: 14, padding: "14px 16px", marginBottom: 16, maxHeight: 220, overflow: "auto" }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{q.passage.title}</div>
          {q.passage.paragraphs.map((p, i) => (
            <p key={i} style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.6, color: "#4A4536" }}>{p}</p>
          ))}
        </div>
      )}

      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, lineHeight: 1.4, color: "var(--s-ink)" }}>{q.prompt}</div>

      <PracticeAnswer q={q} value={value} checked={checked} fb={fb} onChange={onChange} />

      {fb && (
        <div style={{ marginTop: 14, borderRadius: 16, overflow: "hidden", border: "2px solid #EFEAF7", animation: "cometfade .15s ease" }}>
          <div style={{ padding: "11px 16px", fontWeight: 800, fontSize: 14.5, background: fb.correct ? "var(--s-success-soft)" : "var(--s-accent-soft)", color: fb.correct ? "#0E7A55" : "#C2491F" }}>
            {fb.correct ? `Correct!${fb.awarded ? ` ${formatRobuxDelta(fb.awarded)}` : ""}` : `Not quite${fb.awarded ? ` ${formatRobuxDelta(fb.awarded)}` : ""}`}
          </div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {!fb.correct && fb.correctKeys.length === 0 && fb.correctText && (
              <Why icon="✓" iconBg="var(--s-success-soft)" iconColor="#0E7A55" label="Correct answer" text={fb.correctText} labelColor="#0E7A55" />
            )}
            {!fb.correct && fb.whyWrong && (
              <Why icon="✕" iconBg="var(--s-accent-soft)" iconColor="#C2491F" label={fb.whyWrongLabel} text={fb.whyWrong} labelColor="#C2491F" />
            )}
            <Why icon="✓" iconBg="var(--s-success-soft)" iconColor="#0E7A55" label={fb.whyRightLabel} text={fb.whyRight} labelColor="#0E7A55" />
            {!fb.correct && (
              <Link to="/lesson" search={{ subject }} style={lessonReturnLink}>
                Do you want to go back to lesson?
              </Link>
            )}
          </div>
        </div>
      )}

      <button onClick={onCheck} disabled={checked || !hasValue(value) || pending}
        style={{ marginTop: 16, border: "none", cursor: checked || !hasValue(value) ? "default" : "pointer", background: checked ? "var(--s-bg)" : hasValue(value) ? "var(--s-primary)" : "var(--s-bg)", color: checked ? "var(--s-muted)" : hasValue(value) ? "#fff" : "var(--s-muted)", fontWeight: 800, fontSize: 15, padding: "11px 22px", borderRadius: 12 }}>
        {checked ? (fb!.correct ? "Got it ✓" : "Show me again") : pending ? "Checking…" : "Check answer"}
      </button>
    </div>
  );
}

function PracticeAnswer({ q, value, checked, fb, onChange }: {
  q: Question;
  value: AnswerValue | undefined;
  checked: boolean;
  fb: Feedback | undefined;
  onChange: (v: AnswerValue) => void;
}) {
  // Selected-response (MC / multiselect) — button grid with post-check coloring.
  if (q.type === "multiple_choice" || q.type === "multiselect") {
    const multi = q.type === "multiselect";
    const sel = multi ? (Array.isArray(value) ? value : []) : typeof value === "string" ? [value] : [];
    return (
      <>
        {multi && <div style={{ fontWeight: 800, fontSize: 12.5, color: "var(--s-muted)", marginBottom: 8 }}>{q.selectInstruction ?? "Select all that apply."}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {q.options.map((o) => (
            <button key={o.key} onClick={() => {
              if (checked) return;
              if (multi) {
                const next = sel.includes(o.key) ? sel.filter((k) => k !== o.key) : [...sel, o.key];
                onChange(next);
              } else onChange(o.key);
            }}
              style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", cursor: checked ? "default" : "pointer", borderRadius: 14, padding: "13px 15px", fontWeight: 800, fontSize: 15.5, transition: "all .12s ease", ...optStyle(o.key, sel, checked, fb) }}>
              <span style={{ width: 26, height: 26, borderRadius: multi ? 7 : 8, background: "rgba(0,0,0,.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flex: "none" }}>{o.key}</span>
              {o.text}
            </button>
          ))}
        </div>
      </>
    );
  }

  // Hot text — pick a sentence/word.
  if (q.type === "hot_text") {
    const sel = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.tokens.map((t) => {
          const on = sel.includes(t.id);
          return (
            <button key={t.id} disabled={checked} onClick={() => onChange(on ? sel.filter((x) => x !== t.id) : [...sel, t.id])}
              style={{ textAlign: "left", cursor: checked ? "default" : "pointer", borderRadius: 14, padding: "12px 15px", fontWeight: 600, fontSize: 15, lineHeight: 1.5,
                background: on ? "var(--s-primary-soft)" : "#fff", border: on ? "2px solid var(--s-primary)" : "2px solid #ECE7F4", color: on ? "var(--s-primary-ink)" : "var(--s-ink)" }}>
              {t.text}
            </button>
          );
        })}
      </div>
    );
  }

  // Drop-down (inline choice).
  if (q.type === "inline_choice") {
    const blankIds = q.blankIds.length > 0 ? q.blankIds : ["b1"];
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {blankIds.map((bid) => (
          <select key={bid} disabled={checked} value={obj[bid] ?? ""} onChange={(e) => onChange({ ...obj, [bid]: e.target.value })}
            style={{ padding: "13px 14px", borderRadius: 14, border: "2px solid #ECE7F4", fontSize: 15.5, fontWeight: 700, fontFamily: "inherit", background: "#fff", color: "var(--s-ink)", outline: "none" }}>
            <option value="">Choose…</option>
            {q.options.map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
          </select>
        ))}
      </div>
    );
  }

  // Text entry — record your answer in the box.
  const single = q.blankIds.length === 0;
  if (single) {
    return (
      <input disabled={checked} value={typeof value === "string" ? value : ""} placeholder="Type your answer…" onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 14, border: "2px solid #ECE7F4", fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none", color: "var(--s-ink)" }} />
    );
  }
  const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {q.blankIds.map((bid) => (
        <input key={bid} disabled={checked} value={obj[bid] ?? ""} placeholder="Type here…" onChange={(e) => onChange({ ...obj, [bid]: e.target.value })}
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 15px", borderRadius: 14, border: "2px solid #ECE7F4", fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none", color: "var(--s-ink)" }} />
      ))}
    </div>
  );
}

function Why({ icon, iconBg, iconColor, label, text, labelColor }: { icon: string; iconBg: string; iconColor: string; label: string; text: string; labelColor: string }) {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: iconBg, color: iconColor, fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13, color: labelColor, marginBottom: 2 }}>{label}</div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--s-ink)", lineHeight: 1.5 }}>{text}</div>
      </div>
    </div>
  );
}

function optStyle(key: string, sel: string[], checked: boolean, fb: Feedback | undefined): React.CSSProperties {
  if (checked && fb) {
    if (fb.correctKeys.includes(key)) return { background: "var(--s-success-soft)", border: "2px solid var(--s-success)", color: "#0E7A55" };
    if (sel.includes(key) && !fb.correctKeys.includes(key)) return { background: "#FDEAE2", border: "2px solid var(--s-accent)", color: "#C2491F" };
  } else if (sel.includes(key)) {
    return { background: "var(--s-primary-soft)", border: "2px solid var(--s-primary)", color: "var(--s-primary-ink)" };
  }
  return { background: "var(--s-surface)", border: "2px solid #ECE7F4", color: "var(--s-ink)" };
}

const lessonReturnLink: React.CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  background: "var(--s-primary-soft)",
  color: "var(--s-primary-ink)",
  borderRadius: 12,
  padding: "10px 13px",
  fontWeight: 900,
  fontSize: 13.5,
};

function Shell({ children, wallet, pop, onSignOut }: { children: React.ReactNode; wallet: number; pop?: number | null; onSignOut: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--s-bg)", fontFamily: "'Nunito', sans-serif" }}>
      <header style={{ background: "var(--s-surface)", borderBottom: "1px solid #EFE7DA", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
        </div>
        <strong style={{ fontFamily: "'Baloo 2', sans-serif", fontSize: 17, color: "var(--s-ink)" }}>Comet Academy</strong>
        <nav style={{ display: "flex", gap: 14, marginLeft: 14, fontWeight: 800, fontSize: 13.5 }}>
          <Link to="/student" style={{ color: "var(--a-muted)" }}>Home</Link>
          <span style={{ color: "var(--s-primary-ink)" }}>Topics</span>
          <Link to="/wallet" style={{ color: "var(--a-muted)" }}>Wallet</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 7, background: "var(--s-robux-soft)", color: "#B47900", fontWeight: 800, fontSize: 13, padding: "7px 13px", borderRadius: 999 }}>
          <span style={{ width: 13, height: 13, borderRadius: "50%", background: "var(--s-robux)", display: "inline-block" }} />
          {wallet} Robux
          {pop != null && (
            <span style={{ position: "absolute", top: -14, right: 8, color: pop > 0 ? "var(--s-success)" : "var(--s-accent)", fontWeight: 800, fontSize: 14, animation: "cometfade .3s ease" }}>{pop > 0 ? "+" : ""}{pop}</span>
          )}
        </div>
        <button onClick={onSignOut} style={{ border: "1px solid #EFE7DA", background: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 9, cursor: "pointer", color: "var(--s-ink)" }}>
          Sign out
        </button>
      </header>
      {children}
    </div>
  );
}
