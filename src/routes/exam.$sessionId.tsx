import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { SourceBadge } from "~/components/SourceBadge";
import { examState, examAction, examSubmit, examResult, examScoreWritten } from "~/server/rpc/exam";

export const Route = createFileRoute("/exam/$sessionId")({
  loader: ({ params }) => examState({ data: { sessionId: params.sessionId } }),
  component: ExamPlayer,
});

type View = Awaited<ReturnType<typeof examState>>;
type Result = Awaited<ReturnType<typeof examResult>>;
type Item = NonNullable<View["current"]>;
type AnswerValue = string | string[] | Record<string, string>;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function ExamPlayer() {
  const { sessionId } = Route.useParams();
  const initial = Route.useLoaderData();
  const navigate = useNavigate();
  const act = useServerFn(examAction);
  const doSubmit = useServerFn(examSubmit);
  const doResult = useServerFn(examResult);
  const doScoreWritten = useServerFn(examScoreWritten);
  const refresh = useServerFn(examState);

  const [view, setView] = useState<View>(initial);
  const [remaining, setRemaining] = useState(initial.remainingSeconds);
  const [breakRem, setBreakRem] = useState(initial.breakRemainingSeconds);
  const [result, setResult] = useState<Result | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // client-only visual tools
  const [tool, setTool] = useState({ hl: false, reader: false, mask: false, notes: false, cross: false, zoom: 1 });
  const [eliminated, setEliminated] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const notepadDrag = useDrag({ x: typeof window !== "undefined" ? window.innerWidth - 300 : 540, y: 90 });
  const maskDrag = useDrag({ x: 360, y: 280 });
  const readerDrag = useDrag({ x: 0, y: 260 });

  const submitting = useRef(false);

  function applyView(v: View) {
    setView(v);
    setRemaining(v.remainingSeconds);
    setBreakRem(v.breakRemainingSeconds);
  }

  // Display countdown; on expiry, ask the server (which auto-submits).
  useEffect(() => {
    if (view.status !== "in_progress") return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          void refresh({ data: { sessionId } }).then(applyView);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [view.status, sessionId, refresh]);

  useEffect(() => {
    if (view.status !== "on_break") return;
    const t = setInterval(() => setBreakRem((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [view.status]);

  // When the session is submitted, fetch the result payload.
  useEffect(() => {
    if (view.status === "submitted" && !result) void doResult({ data: { sessionId } }).then(setResult);
  }, [view.status, result, sessionId, doResult]);

  // Poll the local model for written (SCR/ECR) scores while any remain pending (§8).
  useEffect(() => {
    if (!result || !result.submitted || !result.scoringPending) return;
    const t = setInterval(() => {
      void doScoreWritten({ data: { sessionId } }).then(setResult);
    }, 3500);
    return () => clearInterval(t);
  }, [result, sessionId, doScoreWritten]);

  async function fire(event: Parameters<typeof act>[0]["data"]["event"]) {
    const v = await act({ data: { sessionId, event } });
    applyView(v);
  }
  function commit(itemId: string, value: AnswerValue) {
    void fire({ kind: "answer", itemId, value });
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    const r = await doSubmit({ data: { sessionId } });
    setResult(r);
    setReviewOpen(false);
    applyView(await refresh({ data: { sessionId } }));
  }

  if (view.status === "submitted") {
    return <Results result={result} onHome={() => navigate({ to: "/practice" })} />;
  }

  const q = view.current;
  const cur = q?.itemId ?? "";
  const struck = eliminated[cur] ?? [];
  const toggleStrike = (key: string) =>
    setEliminated((e) => ({ ...e, [cur]: struck.includes(key) ? struck.filter((k) => k !== key) : [...struck, key] }));

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#EDEFF3", fontFamily: "'Manrope', sans-serif", color: "var(--a-ink)", zIndex: 50 }}>
      {/* Toolbar */}
      <header style={{ background: "#fff", borderBottom: "1px solid var(--a-border)", padding: "10px 18px", display: "flex", alignItems: "center", gap: 16, flex: "none", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5, lineHeight: 1.1 }}>{view.examTitle}</div>
            <div style={{ fontWeight: 700, fontSize: 11.5, color: "var(--a-faint)" }}>{view.sectionSubject?.toUpperCase()} · {q?.teks}</div>
          </div>
          <span style={{ background: "var(--a-accent-soft)", color: "var(--a-accent)", fontWeight: 800, fontSize: 10.5, padding: "4px 10px", borderRadius: 7, letterSpacing: ".03em" }}>
            SECTION {view.sectionIndex + 1}
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#F4F6FA", border: "1px solid var(--a-border)", borderRadius: 12, padding: 4 }}>
            {/* Mark and Cross are mutually exclusive annotation tools (prototype). */}
            <Tool label="Mark" on={tool.hl} onClick={() => setTool((t) => ({ ...t, hl: !t.hl, cross: false }))} />
            <Tool label="Reader" on={tool.reader} onClick={() => setTool((t) => ({ ...t, reader: !t.reader }))} />
            <Tool label="Mask" on={tool.mask} onClick={() => setTool((t) => ({ ...t, mask: !t.mask }))} />
            <Tool label="Notes" on={tool.notes} onClick={() => setTool((t) => ({ ...t, notes: !t.notes }))} />
            <Tool label="Cross" on={tool.cross} onBg="var(--a-bad-soft)" onColor="var(--a-bad)" onClick={() => setTool((t) => ({ ...t, cross: !t.cross, hl: false }))} />
            <Tool label={`${Math.round(tool.zoom * 100)}%`} on={false} onClick={() => setTool((t) => ({ ...t, zoom: t.zoom >= 1.5 ? 1 : +(t.zoom + 0.25).toFixed(2) }))} />
            {view.noCalculator && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--a-faint)", padding: "0 8px" }}>No calculator</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => cur && fire({ kind: "flag", itemId: cur })} style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--a-border)", cursor: "pointer", background: view.flagged.includes(cur) ? "var(--a-warn-soft)" : "#fff", borderRadius: 10, padding: "8px 12px", fontWeight: 800, fontSize: 13, color: view.flagged.includes(cur) ? "#B5760E" : "var(--a-muted)" }}>
            ⚑ Flag
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F6FA", border: "1px solid var(--a-border)", borderRadius: 10, padding: "7px 12px" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: remaining < 60 ? "var(--a-bad)" : "var(--a-good)" }} />
            <span style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{fmt(remaining)}</span>
          </div>
          <button onClick={() => fire({ kind: "pause" })} style={{ border: "none", cursor: "pointer", background: "var(--a-ink)", color: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13 }}>Pause</button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
        <div style={{ maxWidth: q?.passage ? 1120 : 700, margin: "0 auto", display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          {q?.passage && <PassagePane passage={q.passage} />}
          <div style={{ flex: 1, minWidth: 330, background: "#fff", border: "1px solid var(--a-border)", borderRadius: 14, padding: "26px 30px", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <span style={{ background: "var(--s-primary)", color: "#fff", fontWeight: 800, fontSize: 13, width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>{view.currentNum}</span>
              <span style={{ fontWeight: 800, fontSize: 12, color: "var(--a-faint)" }}>{q?.teks}</span>
              {q && <SourceBadge source={q.source} />}
              {q && <TypeTag item={q} />}
            </div>
            <div style={{ zoom: tool.zoom }}>
              <div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1.45, marginBottom: 16 }}>{q?.prompt}</div>
              {q?.figures.map((f) => (f.svg ? <div key={f.id} dangerouslySetInnerHTML={{ __html: f.svg }} style={{ marginBottom: 16 }} /> : null))}
              {q && <AnswerArea key={cur} item={q} crossOn={tool.cross} struck={struck} onToggleStrike={toggleStrike} onCommit={(v) => commit(cur, v)} />}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ background: "#fff", borderTop: "1px solid var(--a-border)", padding: "12px 18px", display: "flex", alignItems: "center", gap: 14, flex: "none" }}>
        <button onClick={() => fire({ kind: "prev" })} style={{ opacity: view.currentNum <= 1 ? 0.4 : 1, border: "1px solid var(--a-border)", cursor: "pointer", background: "#fff", borderRadius: 11, padding: "11px 20px", fontWeight: 800, fontSize: 14 }}>← Previous</button>
        <div style={{ flex: 1, textAlign: "center", fontWeight: 800, fontSize: 14, color: "var(--a-muted)" }}>Question {view.currentNum} of {view.total}</div>
        <button onClick={() => setReviewOpen(true)} style={{ border: "1px solid var(--a-border)", cursor: "pointer", background: "#fff", borderRadius: 11, padding: "11px 20px", fontWeight: 800, fontSize: 14, color: "var(--a-accent)" }}>Review ▦</button>
        <button onClick={() => fire({ kind: "next" })} style={{ border: "none", cursor: "pointer", background: "var(--s-primary)", color: "#fff", borderRadius: 11, padding: "11px 24px", fontWeight: 800, fontSize: 14 }}>Next →</button>
      </footer>

      {/* Notepad — draggable */}
      {tool.notes && (
        <div style={{ position: "fixed", left: notepadDrag.pos.x, top: notepadDrag.pos.y, width: 260, background: "#FFFBEA", border: "1px solid #E8D98C", borderRadius: 12, zIndex: 62, boxShadow: "0 14px 36px rgba(0,0,0,.22)", overflow: "hidden" }}>
          <div onMouseDown={notepadDrag.onMouseDown} style={{ height: 30, background: "#F4E9B8", display: "flex", alignItems: "center", padding: "0 12px", fontWeight: 800, fontSize: 12, color: "#7A6A24", cursor: "grab" }}>Notepad</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scratch work…" style={{ width: "100%", height: 140, border: "none", background: "transparent", resize: "none", padding: 12, fontFamily: "'Manrope', sans-serif", fontSize: 13.5, color: "#4A4424", outline: "none", boxSizing: "border-box" }} />
        </div>
      )}
      {/* Mask — draggable */}
      {tool.mask && (
        <div style={{ position: "fixed", left: maskDrag.pos.x, top: maskDrag.pos.y, width: 280, height: 150, background: "#5A6678", borderRadius: 10, zIndex: 61, boxShadow: "0 10px 30px rgba(0,0,0,.25)", overflow: "hidden" }}>
          <div onMouseDown={maskDrag.onMouseDown} style={{ height: 26, background: "#46505F", cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10.5, fontWeight: 800 }}>drag to cover · click Mask to remove</div>
        </div>
      )}
      {/* Line reader — draggable vertically */}
      {tool.reader && (
        <div onMouseDown={readerDrag.onMouseDown} style={{ position: "fixed", left: 0, right: 0, top: readerDrag.pos.y, height: 46, background: "rgba(47,91,234,.1)", borderTop: "2px solid rgba(47,91,234,.55)", borderBottom: "2px solid rgba(47,91,234,.55)", cursor: "grab", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14 }}>
          <span style={{ background: "var(--a-accent)", color: "#fff", fontWeight: 800, fontSize: 11, padding: "3px 9px", borderRadius: 7 }}>drag reader ↕</span>
        </div>
      )}

      {/* Pause overlay */}
      {view.status === "paused" && (
        <Overlay>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", color: "var(--a-faint)" }}>TIMER PAUSED</div>
          <div style={{ fontWeight: 800, fontSize: 42, margin: "8px 0 4px", fontVariantNumeric: "tabular-nums" }}>{fmt(remaining)}</div>
          <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 14, marginBottom: 22 }}>Take a breath. Your time is frozen.</div>
          <button onClick={() => fire({ kind: "resume" })} style={primaryBtn}>Resume</button>
        </Overlay>
      )}

      {/* Break overlay */}
      {view.status === "on_break" && (
        <Overlay>
          <div style={{ fontSize: 40, marginBottom: 8 }}>☕</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".08em", color: "var(--a-faint)" }}>BREAK TIME</div>
          <div style={{ fontWeight: 800, fontSize: 24, margin: "6px 0 2px" }}>Nice work on the first section!</div>
          <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 14.5, marginBottom: 18 }}>Stretch, breathe, grab some water.</div>
          <div style={{ fontWeight: 800, fontSize: 48, fontVariantNumeric: "tabular-nums", color: "var(--a-accent)", marginBottom: 20 }}>{fmt(breakRem)}</div>
          <button onClick={() => fire({ kind: "endBreak" })} style={primaryBtn}>Start next section →</button>
        </Overlay>
      )}

      {/* Review grid */}
      {reviewOpen && (
        <div onClick={() => setReviewOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(19,26,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 71 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 30, width: "100%", maxWidth: 560, boxShadow: "0 30px 70px rgba(0,0,0,.4)" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>Review your answers</h2>
            <div style={{ display: "flex", gap: 16, marginBottom: 20, fontWeight: 800, fontSize: 13, color: "var(--a-muted)" }}>
              <span><span style={{ color: "var(--s-primary)" }}>●</span> {view.answeredCount} answered</span>
              <span><span style={{ color: "#C4CCDA" }}>●</span> {view.total - view.answeredCount} blank</span>
              <span><span style={{ color: "var(--a-warn)" }}>▣</span> {view.flagged.length} flagged</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 24 }}>
              {view.review.map((r) => (
                <button key={r.itemId} onClick={() => { void fire({ kind: "goto", index: r.num - 1 }); setReviewOpen(false); }}
                  style={{ position: "relative", aspectRatio: "1", border: r.flagged ? "2px solid var(--a-warn)" : r.answered ? "2px solid var(--s-primary)" : "2px solid #DCE2EC", background: r.answered ? "var(--s-primary-soft)" : "#fff", color: "var(--a-ink)", borderRadius: 12, fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
                  {r.num}
                  {r.flagged && <span style={{ position: "absolute", top: 5, right: 6, width: 8, height: 8, borderRadius: "50%", background: "var(--a-warn)" }} />}
                </button>
              ))}
            </div>
            <button onClick={submit} style={{ width: "100%", border: "none", cursor: "pointer", background: "var(--s-success)", color: "#fff", borderRadius: 14, padding: 15, fontWeight: 800, fontSize: 17, boxShadow: "0 10px 24px rgba(22,176,122,.3)" }}>Submit exam</button>
            <button onClick={() => setReviewOpen(false)} style={{ width: "100%", border: "none", cursor: "pointer", background: "none", color: "var(--a-muted)", padding: 12, fontWeight: 800, fontSize: 14, marginTop: 4 }}>Keep working</button>
          </div>
        </div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { border: "none", cursor: "pointer", background: "var(--s-primary)", color: "#fff", borderRadius: 12, padding: "13px 34px", fontWeight: 800, fontSize: 16 };

const TYPE_LABELS: Record<string, string> = {
  text_entry: "Type your answer",
  inline_choice: "Choose from the menu",
  hot_text: "Click the sentence",
  multipart: "Parts A & B",
  scr: "Written · 2 pts",
  ecr: "Written · 5 pts",
};
function TypeTag({ item }: { item: Item }) {
  const label = item.type === "multiselect" ? item.selectInstruction : TYPE_LABELS[item.type];
  if (!label) return null;
  return <span style={{ marginLeft: "auto", background: "#EEF1F6", color: "var(--a-muted)", fontWeight: 800, fontSize: 10.5, padding: "4px 10px", borderRadius: 7, letterSpacing: ".03em" }}>{label}</span>;
}

function PassagePane({ passage }: { passage: NonNullable<Item["passage"]> }) {
  return (
    <aside style={{ flex: "1 1 420px", maxWidth: 480, alignSelf: "stretch", background: "#fff", border: "1px solid var(--a-border)", borderRadius: 14, padding: "22px 26px", maxHeight: "calc(100vh - 200px)", overflow: "auto", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 2 }}>{passage.title}</div>
      <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 11.5, textTransform: "capitalize", marginBottom: 14 }}>
        {passage.genre}{passage.level ? ` · ${passage.level}` : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {passage.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#2C3242" }}>{p}</p>
        ))}
      </div>
    </aside>
  );
}

/** Renders the response control for ANY item type and commits the typed value. */
function AnswerArea({ item, crossOn, struck, onToggleStrike, onCommit }: {
  item: Item;
  crossOn: boolean;
  struck: string[];
  onToggleStrike: (key: string) => void;
  onCommit: (value: AnswerValue) => void;
}) {
  const r = item.response;
  const asArray = Array.isArray(r) ? (r as string[]) : [];
  const asObject = r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, string>) : {};
  const asString = typeof r === "string" ? r : "";

  const [multi, setMulti] = useState<string[]>(asArray);
  const [obj, setObj] = useState<Record<string, string>>(asObject);
  const [text, setText] = useState<string>(asString);

  // ---- selected/structured ----
  if (item.type === "multiple_choice" || (item.options.length > 0 && item.type !== "multiselect" && item.type !== "inline_choice")) {
    return (
      <OptionList options={item.options} crossOn={crossOn} struck={struck} onToggleStrike={onToggleStrike}
        isSelected={(k) => asString === k} onPick={(k) => onCommit(k)} />
    );
  }

  if (item.type === "multiselect") {
    return (
      <OptionList options={item.options} multi crossOn={crossOn} struck={struck} onToggleStrike={onToggleStrike}
        isSelected={(k) => multi.includes(k)}
        onPick={(k) => {
          const next = multi.includes(k) ? multi.filter((x) => x !== k) : [...multi, k];
          setMulti(next);
          onCommit(next);
        }} />
    );
  }

  if (item.type === "hot_text") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {item.tokens.map((t) => {
          const on = multi.includes(t.id);
          return (
            <button key={t.id} onClick={() => {
              const next = on ? multi.filter((x) => x !== t.id) : [...multi, t.id];
              setMulti(next);
              onCommit(next);
            }} style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "13px 16px", fontWeight: 600, fontSize: 15.5, lineHeight: 1.5,
              background: on ? "var(--s-primary-soft)" : "#fff", border: on ? "2px solid var(--s-primary)" : "2px solid #DCE2EC", color: on ? "var(--s-primary-ink)" : "var(--s-ink)" }}>
              {t.text}
            </button>
          );
        })}
      </div>
    );
  }

  if (item.type === "inline_choice") {
    const blankIds = item.blankIds.length > 0 ? item.blankIds : ["b1"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {blankIds.map((bid) => (
          <select key={bid} value={obj[bid] ?? ""} onChange={(e) => { const next = { ...obj, [bid]: e.target.value }; setObj(next); onCommit(next); }}
            style={{ padding: "13px 14px", borderRadius: 12, border: "2px solid #DCE2EC", fontSize: 15.5, fontWeight: 700, fontFamily: "inherit", background: "#fff", color: "var(--s-ink)", outline: "none" }}>
            <option value="">Choose…</option>
            {item.options.map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
          </select>
        ))}
      </div>
    );
  }

  if (item.type === "text_entry") {
    if (item.blankIds.length > 0) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {item.blankIds.map((bid) => (
            <input key={bid} defaultValue={obj[bid] ?? ""} placeholder="Type here…"
              onBlur={(e) => { const next = { ...obj, [bid]: e.target.value }; setObj(next); onCommit(next); }}
              style={inputBox} />
          ))}
        </div>
      );
    }
    return <input defaultValue={text} placeholder="Type your answer…" onBlur={(e) => { setText(e.target.value); onCommit(e.target.value); }} style={inputBox} />;
  }

  if (item.type === "multipart") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {item.parts.map((part) => (
          <div key={part.id}>
            <div style={{ fontWeight: 800, fontSize: 15.5, marginBottom: 10 }}>{part.prompt}</div>
            <OptionList options={part.options} crossOn={crossOn} struck={struck} onToggleStrike={onToggleStrike}
              isSelected={(k) => obj[part.id] === k}
              onPick={(k) => { const next = { ...obj, [part.id]: k }; setObj(next); onCommit(next); }} />
          </div>
        ))}
      </div>
    );
  }

  if (item.type === "scr" || item.type === "ecr") {
    return (
      <div>
        <textarea defaultValue={text} placeholder="Write your answer in complete sentences…"
          onBlur={(e) => { setText(e.target.value); onCommit(e.target.value); }}
          style={{ width: "100%", minHeight: item.type === "ecr" ? 200 : 130, boxSizing: "border-box", padding: "14px 16px", borderRadius: 12, border: "2px solid #DCE2EC", fontSize: 15.5, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", outline: "none", color: "var(--s-ink)" }} />
        <div style={{ marginTop: 8, color: "var(--a-faint)", fontWeight: 700, fontSize: 12 }}>
          Worth {item.maxPoints} {item.maxPoints === 1 ? "point" : "points"} · a teacher's helper scores written answers right after you submit.
        </div>
      </div>
    );
  }

  // Fallback (e.g. math types without options): a single text field.
  return <input defaultValue={text} placeholder="Type your answer…" onBlur={(e) => { setText(e.target.value); onCommit(e.target.value); }} style={inputBox} />;
}

const inputBox: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 12, border: "2px solid #DCE2EC", fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none", color: "var(--s-ink)" };

function OptionList({ options, multi = false, crossOn, struck, onToggleStrike, isSelected, onPick }: {
  options: { key: string; text: string }[];
  multi?: boolean;
  crossOn: boolean;
  struck: string[];
  onToggleStrike: (key: string) => void;
  isSelected: (key: string) => boolean;
  onPick: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {options.map((o) => {
        const selected = isSelected(o.key);
        const isStruck = struck.includes(o.key);
        return (
          <button key={o.key} onClick={() => (crossOn ? onToggleStrike(o.key) : onPick(o.key))}
            style={{ display: "flex", alignItems: "center", gap: 13, textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "14px 16px",
              background: selected ? "var(--s-primary-soft)" : "#fff", border: selected ? "2px solid var(--s-primary)" : "2px solid #DCE2EC",
              color: selected ? "var(--s-primary-ink)" : "var(--s-ink)", fontWeight: 700, fontSize: 16, opacity: isStruck ? 0.45 : 1, textDecoration: isStruck ? "line-through" : "none" }}>
            <span style={{ width: 28, height: 28, borderRadius: multi ? 7 : 8, background: selected ? "var(--s-primary)" : "#EEF1F6", color: selected ? "#fff" : "var(--a-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flex: "none" }}>{o.key}</span>
            {o.text}
          </button>
        );
      })}
    </div>
  );
}

function Tool({ label, on, onClick, onBg = "var(--a-accent-soft)", onColor = "var(--a-accent)" }: { label: string; on: boolean; onClick: () => void; onBg?: string; onColor?: string }) {
  return (
    <button onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", cursor: "pointer", background: on ? onBg : "#fff", borderRadius: 9, padding: "6px 12px", fontSize: 10, fontWeight: 800, color: on ? onColor : "var(--a-muted)" }}>
      {label}
    </button>
  );
}

/** Minimal pointer-drag for the floating exam tools (§9 fidelity). */
function useDrag(initial: { x: number; y: number }) {
  const [pos, setPos] = useState(initial);
  const ref = useRef<{ dx: number; dy: number } | null>(null);
  function onMouseDown(e: React.MouseEvent) {
    ref.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const move = (ev: MouseEvent) => {
      if (!ref.current) return;
      setPos({ x: ev.clientX - ref.current.dx, y: ev.clientY - ref.current.dy });
    };
    const up = () => {
      ref.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
  return { pos, onMouseDown };
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(19,26,42,.74)", backdropFilter: "blur(6px)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 22, padding: "42px 48px", textAlign: "center", boxShadow: "0 30px 70px rgba(0,0,0,.4)", maxWidth: 440 }}>{children}</div>
    </div>
  );
}

function Results({ result, onHome }: { result: Result | null; onHome: () => void }) {
  if (!result || !result.submitted || !result.result) {
    return <div style={{ padding: 60, textAlign: "center", fontFamily: "'Manrope',sans-serif", color: "var(--a-muted)", fontWeight: 700 }}>Scoring…</div>;
  }
  const r = result.result;
  const total = r.overall.total;
  const pct = total > 0 ? Math.round((r.overall.correctCount / total) * 100) : 0;
  const written = result.written;
  return (
    <div style={{ minHeight: "100vh", background: "var(--s-bg)", fontFamily: "'Nunito',sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 34 }}>Exam complete! 🎉</div>
          <div style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 15 }}>Here's how you did</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: 18 }}>
          <div style={{ background: "#fff", borderRadius: 24, padding: 26, boxShadow: "0 10px 28px rgba(54,48,74,.07)", display: "flex", alignItems: "center", gap: 22 }}>
            <svg width="116" height="116" viewBox="0 0 128 128" style={{ flex: "none" }}>
              <circle cx="64" cy="64" r="54" fill="none" stroke="#EEE9F6" strokeWidth="14" />
              <circle cx="64" cy="64" r="54" fill="none" stroke="#6C4CE0" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 339.292} 339.292`} transform="rotate(-90 64 64)" />
              <text x="64" y="60" fontFamily="Baloo 2" fontWeight="800" fontSize="30" fill="#36304A" textAnchor="middle">{pct}%</text>
              <text x="64" y="82" fontFamily="Nunito" fontWeight="800" fontSize="14" fill="#8A8198" textAnchor="middle">score</text>
            </svg>
            <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 30 }}>{r.overall.correctCount} / {total}</div>
            <div style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>auto-scored questions correct</div>
            {r.perSubject.map((s) => (
              <div key={s.subject} style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13.5, marginTop: 6 }}>
                <span style={{ textTransform: "capitalize" }}>{s.subject}</span>
                <span style={{ background: s.level === "masters" || s.level === "meets" ? "var(--s-success-soft)" : "var(--s-robux-soft)", color: s.level === "masters" || s.level === "meets" ? "#0E7A55" : "#9C6A00", padding: "3px 10px", borderRadius: 999 }}>
                  {s.level ? s.level.replace(/_/g, " ") : "—"}
                </span>
              </div>
            ))}
            </div>
          </div>
          <div style={{ background: r.robux.net > 0 ? "var(--s-robux)" : "#8A8198", borderRadius: 24, padding: 24, color: "#fff", boxShadow: "0 10px 28px rgba(242,169,0,.22)" }}>
            <div style={{ fontWeight: 800, fontSize: 14, opacity: 0.92 }}>ROBUX THIS EXAM</div>
            <div style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 44, lineHeight: 1, margin: "4px 0 12px" }}>{r.robux.net}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,.16)", borderRadius: 13, padding: "12px 14px" }}>
              <Row a={`${r.overall.correctCount} correct × +${r.perCorrect}`} b={`${r.robux.gross}`} />
              <Row a={`${r.overall.wrongCount} wrong × −${r.perWrong}`} b={`−${r.robux.penalty}`} />
              <div style={{ height: 1, background: "rgba(255,255,255,.3)", margin: "2px 0" }} />
              <Row a="Net to wallet" b={`${r.robux.net}`} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 12.5, opacity: 0.95, marginTop: 10 }}>Wrong answers cost Robux — accuracy pays off!</div>
          </div>
        </div>

        {/* Written responses — scored by the local model, with parent/teacher override (§8) */}
        {written.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 10px 28px rgba(54,48,74,.07)", marginBottom: 22 }}>
            <h3 style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 19, margin: "0 0 4px" }}>
              Written responses {result.scoringPending && <span style={{ fontSize: 13, color: "var(--s-muted)" }}>· scoring… ⏳</span>}
            </h3>
            <p style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 13.5, margin: "0 0 14px" }}>These are read by a teacher's helper and can be re-scored by a grown-up.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {written.map((w) => <WrittenCard key={w.jobId} w={w} />)}
            </div>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 24, padding: 24, boxShadow: "0 10px 28px rgba(54,48,74,.07)", marginBottom: 22 }}>
          <h3 style={{ fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 19, margin: "0 0 4px" }}>Let's review the tricky ones</h3>
          <p style={{ color: "var(--s-muted)", fontWeight: 700, fontSize: 13.5, margin: "0 0 14px" }}>Here's the right way — this is how we learn!</p>
          {r.itemReview.filter((m) => !m.correct && !m.pending).length === 0 && (
            <div style={{ background: "var(--s-success-soft)", borderRadius: 14, padding: 18, fontWeight: 800, color: "#0E7A55", textAlign: "center" }}>Perfect score on the auto-graded questions! 🌟</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {r.itemReview.filter((m) => !m.correct && !m.pending).map((m, i) => (
              <div key={m.itemId} style={{ border: "2px solid #EFEAF7", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 14.5 }}>{i + 1}. {m.prompt}</span>
                  <SourceBadge source={m.source} tone="student" />
                </div>
                <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: "var(--s-accent-soft)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                  <span style={{ color: "#C2491F", fontWeight: 800 }}>✕</span>
                  <div><div style={{ fontWeight: 800, fontSize: 12.5, color: "#C2491F" }}>YOU ANSWERED: {m.yourAnswer}</div><div style={{ fontWeight: 600, fontSize: 14, color: "#7A3217", lineHeight: 1.5 }}>{m.whyWrong}</div></div>
                </div>
                <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: "var(--s-success-soft)", borderRadius: 12, padding: "12px 14px" }}>
                  <span style={{ color: "#0E7A55", fontWeight: 800 }}>✓</span>
                  <div><div style={{ fontWeight: 800, fontSize: 12.5, color: "#0E7A55" }}>HERE'S THE RIGHT WAY</div><div style={{ fontWeight: 600, fontSize: 14, color: "#155E45", lineHeight: 1.5 }}>{m.solution}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onHome} style={{ width: "100%", border: "none", cursor: "pointer", background: "var(--s-primary)", color: "#fff", fontFamily: "'Baloo 2',sans-serif", fontWeight: 800, fontSize: 17, padding: 15, borderRadius: 16 }}>Back to practice</button>
      </div>
    </div>
  );
}

type Written = Extract<Result, { submitted: true }>["written"][number];
function WrittenCard({ w }: { w: Written }) {
  const pending = w.status === "pending" || w.status === "scoring";
  const badge = pending
    ? { text: "Scoring…", bg: "var(--s-robux-soft)", color: "#9C6A00" }
    : w.status === "manual"
      ? { text: "Needs teacher review", bg: "var(--s-accent-soft)", color: "#C2491F" }
      : { text: `${w.score}/${w.maxPoints} pts${w.status === "overridden" ? " · set by grown-up" : ""}`, bg: "var(--s-success-soft)", color: "#0E7A55" };
  return (
    <div style={{ border: "2px solid #EFEAF7", borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 11, color: "var(--a-faint)" }}>{w.itemType.toUpperCase()} · {w.teks}</span>
        <SourceBadge source={w.itemSource} tone="student" />
        <span style={{ marginLeft: "auto", background: badge.bg, color: badge.color, fontWeight: 800, fontSize: 12, padding: "4px 11px", borderRadius: 999 }}>{badge.text}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 8 }}>{w.prompt}</div>
      <div style={{ background: "#F7F5FB", borderRadius: 10, padding: "10px 13px", fontWeight: 600, fontSize: 13.5, color: "#3C3650", marginBottom: 8, whiteSpace: "pre-wrap" }}>
        {w.responseText.trim() ? w.responseText : "(left blank)"}
      </div>
      {!pending && w.justification && (
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", fontWeight: 600, fontSize: 13.5, color: "var(--s-ink)", lineHeight: 1.5 }}>
          <span>💬</span><span>{w.justification}</span>
        </div>
      )}
      {!pending && w.tips.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "var(--s-muted)", fontWeight: 700, fontSize: 13 }}>
          {w.tips.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

function Row({ a, b }: { a: string; b: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13.5 }}>
      <span>{a}</span><span>{b}</span>
    </div>
  );
}
