import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { completeLesson, lessonForToday } from "~/server/rpc/lesson";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/lesson")({
  validateSearch: (s: Record<string, unknown>): { subject?: string } => (typeof s.subject === "string" ? { subject: s.subject } : {}),
  loaderDeps: ({ search }) => ({ subject: search.subject ?? "math" }),
  loader: ({ deps }) => lessonForToday({ data: { subject: deps.subject } }),
  component: LessonPage,
});

type LessonData = Awaited<ReturnType<typeof lessonForToday>>;
type Lesson = Extract<LessonData, { available: true }>;

const SUBJECTS = [
  { key: "math", label: "Math", icon: "🔢" },
  { key: "rla", label: "English", icon: "📖" },
];

function LessonPage() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const doCompleteLesson = useServerFn(completeLesson);
  const [lessonData, setLessonData] = useState(data);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exit() {
    await doLogout({});
    navigate({ to: "/" });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--s-bg)", color: "var(--s-ink)", fontFamily: "'Nunito', sans-serif" }}>
      <StudentHeader active="lesson" displayName={lessonData.displayName} onLogout={exit} />
      <main style={{ width: "min(920px, calc(100% - 32px))", margin: "0 auto", padding: "32px 0 54px" }}>
        <Link to="/student" style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 13.5 }}>← Back to plan</Link>
        {!lessonData.available ? (
          <section style={lessonCard}>
            <h1 style={lessonTitle}>No lesson is ready yet</h1>
            <p style={lessonCopy}>Ask an admin to add content for today’s program, then come back here before practice.</p>
          </section>
        ) : (
          <LessonCard
            lesson={lessonData}
            completing={completing}
            error={error}
            onComplete={async () => {
              if (!lessonData.available) return;
              setCompleting(true);
              setError(null);
              try {
                const updated = await doCompleteLesson({ data: { subject: lessonData.subject, standardCode: lessonData.standardCode } });
                setLessonData(updated);
                navigate({ to: "/practice", search: { subject: lessonData.subject, lesson: 1 } });
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setCompleting(false);
              }
            }}
          />
        )}
      </main>
    </div>
  );
}

function StudentHeader({ active, displayName, onLogout }: { active: "lesson" | "home"; displayName: string; onLogout: () => Promise<void> }) {
  return (
    <header style={{ background: "var(--s-surface)", borderBottom: "1px solid #EFE7DA" }}>
      <div style={{ width: "min(1080px, calc(100% - 32px))", margin: "0 auto", minHeight: 58, display: "flex", alignItems: "center", gap: 20, padding: "8px 0" }}>
        <Link to="/student" style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: "var(--s-primary)", display: "grid", placeItems: "center" }}>
            <span style={{ width: 13, height: 13, borderRadius: "50%", background: "#fff" }} />
          </span>
          <span style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 20 }}>Comet</span>
        </Link>
        <nav style={{ display: "flex", gap: 8, color: "var(--s-muted)", fontWeight: 900, fontSize: 14 }}>
          <Link to="/student" style={navLink(active === "home")}>Home</Link>
          <Link to="/practice" style={navLink(false)}>Topics</Link>
          <Link to="/wallet" style={navLink(false)}>Wallet</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 13 }}>{displayName}</span>
        <button onClick={onLogout} style={{ border: "1px solid #EFE7DA", background: "#fff", boxShadow: "0 8px 18px rgba(54,48,74,.06)", color: "var(--s-muted)", borderRadius: 12, padding: "10px 15px", cursor: "pointer", fontWeight: 900 }}>
          Exit
        </button>
      </div>
    </header>
  );
}

function LessonCard({ lesson, completing, error, onComplete }: { lesson: Lesson; completing: boolean; error: string | null; onComplete: () => void }) {
  const hasAuthoredBody = lesson.body.length > 0;
  const hasAuthoredExamples = lesson.practiceExamples.length > 0;
  const lessonRef = useRef<HTMLElement | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function viewPdf() {
    if (!lessonRef.current || pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    const preview = window.open("", "_blank");
    if (preview) {
      preview.document.write("<!doctype html><title>Preparing lesson PDF...</title><body style=\"font-family:sans-serif;padding:24px;font-weight:700\">Preparing lesson PDF...</body>");
      preview.document.close();
    }

    try {
      await document.fonts?.ready;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const source = lessonRef.current;
      const canvas = await html2canvas(source, {
        backgroundColor: "#ffffff",
        scale: Math.max(2, window.devicePixelRatio || 1),
        useCORS: true,
        logging: false,
        windowWidth: Math.max(document.documentElement.clientWidth, source.scrollWidth),
        windowHeight: Math.max(document.documentElement.clientHeight, source.scrollHeight),
      });
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
        hotfixes: ["px_scaling"],
      });
      pdf.setProperties({
        title: `${lesson.subjectLabel} ${lesson.standardCode} - ${lesson.title}`,
        subject: "Comet Academy lesson",
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      if (preview) {
        preview.location.href = url;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 1000 * 60 * 10);
    } catch (e) {
      preview?.close();
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <>
    <div style={lessonTools}>
      <button onClick={viewPdf} disabled={pdfBusy} style={pdfButton}>
        {pdfBusy ? "Preparing PDF..." : "View PDF"}
      </button>
    </div>
    <section ref={lessonRef} style={lessonCard}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={pill("var(--s-primary-soft)", "var(--s-primary-ink)")}>TEKS {lesson.standardCode}</span>
        <span style={pill("#D9F0FF", "#1B76A0")}>{lesson.subjectLabel} · Lesson</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {SUBJECTS.map((subject) => (
          <Link
            key={subject.key}
            to="/lesson"
            search={{ subject: subject.key }}
            style={subjectLessonButton(lesson.subject === subject.key)}
          >
            <span>{subject.icon}</span> {subject.label} lesson
          </Link>
        ))}
      </div>
      <h1 style={lessonTitle}>{lesson.title}</h1>
      <p style={lessonCopy}>{lesson.intro}</p>

      {lesson.vocabulary.length > 0 && (
        <>
          <h2 style={smallHeading}>Words to know</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 26 }}>
            {lesson.vocabulary.map((word) => (
              <span key={word.term} style={{ background: "#FBF4EA", borderRadius: 12, padding: "10px 14px", color: "var(--s-muted)", fontWeight: 900, fontSize: 13 }}>
                <b style={{ color: "var(--s-primary-ink)" }}>{word.term}</b> — {word.meaning}
              </span>
            ))}
          </div>
        </>
      )}

      {hasAuthoredBody ? <LessonBody blocks={lesson.body} /> : <LessonVisual lesson={lesson} />}

      {hasAuthoredExamples ? (
        <>
          <h2 style={smallHeading}>Practice examples</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {lesson.practiceExamples.map((example, index) => (
              <LessonPracticeExample key={example.id ?? `${index}:${JSON.stringify(example.prompt)}`} example={example} num={index + 1} />
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 style={smallHeading}>Worked examples</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {lesson.examples.length === 0 ? (
              <ExampleRow num={1} text="Read the lesson, then try a short practice set to show what you know." tone="primary" />
            ) : (
              lesson.examples.map((example, index) => (
                <ExampleRow
                  key={`${example.num}:${example.prompt}`}
                  num={example.num}
                  text={`${example.prompt}${example.solution ? ` - ${example.solution}` : ""}`}
                  tone={index === lesson.examples.length - 1 ? "success" : "primary"}
                />
              ))
            )}
          </div>
        </>
      )}

      <div style={{ background: "#DDF7EE", color: "#0B7A58", borderRadius: 14, padding: "16px 18px", fontWeight: 900, margin: "24px 0 22px" }}>
        {lesson.completed ? "Lesson complete. Practice is unlocked." : `You've got this, ${lesson.firstName}. Learn it first, then practice it.`}
      </div>

      {error && <div style={{ color: "#C2491F", fontWeight: 900, fontSize: 13.5, marginBottom: 12 }}>{error}</div>}
      {pdfError && <div style={{ color: "#C2491F", fontWeight: 900, fontSize: 13.5, marginBottom: 12 }}>PDF could not be generated: {pdfError}</div>}
      <button onClick={onComplete} disabled={completing} style={{ ...practiceButton, border: "none", cursor: completing ? "wait" : "pointer" }}>
        {completing ? "Unlocking practice..." : lesson.completed ? "Practice this lesson →" : "Complete lesson and practice →"}
      </button>
    </section>
    </>
  );
}

function LessonBody({ blocks }: { blocks: Lesson["body"] }) {
  return (
    <div style={{ display: "grid", gap: 14, margin: "6px 0 24px" }}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          const Tag = block.level === 4 ? "h4" : block.level === 3 ? "h3" : "h2";
          return <Tag key={index} style={bodyHeading(block.level)}>{block.text}</Tag>;
        }
        if (block.kind === "paragraph") {
          if (block.html) return <SafeMarkup key={index} html={block.html} style={bodyParagraphBox} />;
          return <p key={index} style={bodyParagraph}>{block.text}</p>;
        }
        if (block.kind === "html") return <SafeMarkup key={index} html={block.html} style={bodyParagraphBox} />;
        if (block.kind === "svg") {
          return (
            <figure key={index} style={svgFigure}>
              <SafeMarkup html={block.svg} style={svgWrap} />
              <figcaption style={svgCaption}>{block.caption ?? block.alt}</figcaption>
            </figure>
          );
        }
        if (block.kind === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={index} style={bodyList}>
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ListTag>
          );
        }
        return (
          <div key={index} style={calloutBox(block.tone)}>
            {block.title && <div style={calloutTitle}>{block.title}</div>}
            {block.text && <div style={calloutText}>{block.text}</div>}
          </div>
        );
      })}
    </div>
  );
}

function LessonPracticeExample({ example, num }: { example: Lesson["practiceExamples"][number]; num: number }) {
  const [show, setShow] = useState(false);
  return (
    <div style={lessonExampleCard}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--s-primary)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, flex: "none" }}>{num}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <RichContentView content={example.prompt} />
          {example.options.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {example.options.map((option) => (
                <div key={option.key} style={lessonOption(show && !!option.correct)}>
                  <span style={{ fontWeight: 900 }}>{option.key}.</span> {option.text}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShow((value) => !value)} style={showAnswerButton}>
            {show ? "Hide answer" : "Show answer"}
          </button>
          {show && (
            <div style={answerBox}>
              <div style={{ fontWeight: 900, color: "#0E7A55", marginBottom: 6 }}>Answer</div>
              <RichContentView content={example.answer} />
              {example.explanation.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 900, color: "var(--s-primary-ink)", marginBottom: 6 }}>Why it works</div>
                  <RichContentView content={example.explanation} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RichContentView({ content }: { content: Lesson["practiceExamples"][number]["prompt"] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {content.map((node, index) => {
        if (typeof node === "string") return <p key={index} style={richParagraph}>{node}</p>;
        if (node.kind === "heading") return <h3 key={index} style={bodyHeading(3)}>{node.text}</h3>;
        if (node.kind === "list") return <ul key={index} style={bodyList}>{(node.items ?? []).map((item) => <li key={item}>{item}</li>)}</ul>;
        if (node.kind === "math") return <code key={index} style={mathText}>{node.text}</code>;
        if (node.kind === "code") return <code key={index} style={codeText}>{node.text}</code>;
        if (node.kind === "blank") return <span key={index} style={blankText}>_____</span>;
        return <p key={index} style={richParagraph}>{node.text ?? ""}</p>;
      })}
    </div>
  );
}

function SafeMarkup({ html, style }: { html: string; style: React.CSSProperties }) {
  return <div style={style} dangerouslySetInnerHTML={{ __html: sanitizeMarkup(html) }} />;
}

function sanitizeMarkup(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

function LessonVisual({ lesson }: { lesson: Lesson }) {
  if (lesson.visualKind === "number_line") return <NumberLineVisual />;
  if (lesson.visualKind === "fraction_bars") return <FractionBarsVisual />;
  if (lesson.visualKind === "place_value") return <PlaceValueVisual />;
  if (lesson.visualKind === "array") return <ArrayVisual />;
  if (lesson.visualKind === "text_evidence") return <TextEvidenceVisual />;
  return <StepsVisual />;
}

function NumberLineVisual() {
  return (
    <div style={visualBox}>
      <div style={visualLead}>This line is split into 4 equal parts. The point is at 3/4.</div>
      <div style={{ position: "relative", height: 122, marginTop: 18 }}>
        <div style={{ position: "absolute", left: "9%", right: "9%", top: 55, height: 5, borderRadius: 4, background: "#3D3659" }} />
        {[0, 1, 2, 3, 4].map((tick) => (
          <div key={tick} style={{ position: "absolute", left: `${9 + tick * 20.5}%`, top: 38, width: 5, height: 38, borderRadius: 4, background: "#3D3659" }} />
        ))}
        {["0", "1/4", "2/4", "3/4", "1"].map((label, index) => (
          <span key={label} style={{ position: "absolute", left: `${8 + index * 20.5}%`, top: 82, color: "var(--s-muted)", fontWeight: 900, fontSize: 22 }}>{label}</span>
        ))}
        <span style={{ position: "absolute", left: "67.5%", top: 2, color: "var(--s-primary)", fontWeight: 900, fontSize: 28 }}>3/4</span>
        <span style={{ position: "absolute", left: "69.4%", top: 42, width: 28, height: 28, borderRadius: "50%", background: "var(--s-primary)", border: "4px solid #fff", boxShadow: "0 0 0 2px #D9CEF9" }} />
      </div>
    </div>
  );
}

function FractionBarsVisual() {
  return (
    <div style={visualBox}>
      <div style={visualLead}>Equivalent fractions cover the same amount of the whole.</div>
      {[
        ["1/2", 2, 1],
        ["2/4", 4, 2],
        ["3/6", 6, 3],
      ].map(([label, parts, filled]) => (
        <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 12, alignItems: "center", marginTop: 12 }}>
          <span style={{ fontWeight: 900, color: "var(--s-primary-ink)" }}>{label}</span>
          <span style={{ display: "grid", gridTemplateColumns: `repeat(${parts},1fr)`, gap: 4 }}>
            {Array.from({ length: Number(parts) }, (_, index) => <span key={index} style={{ height: 28, borderRadius: 7, background: index < Number(filled) ? "var(--s-primary)" : "#fff", border: "2px solid #E8DCF7" }} />)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlaceValueVisual() {
  return (
    <div style={visualBox}>
      <div style={visualLead}>Each place is worth 10 times the place to its right.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginTop: 16 }}>
        {["Ten-thousands", "Thousands", "Hundreds", "Tens", "Ones"].map((place, index) => (
          <div key={place} style={{ background: index === 2 ? "var(--s-primary)" : "#fff", color: index === 2 ? "#fff" : "var(--s-muted)", borderRadius: 12, padding: 12, textAlign: "center", fontWeight: 900 }}>
            <div style={{ fontSize: 12 }}>{place}</div>
            <div style={{ fontSize: 24, marginTop: 6 }}>{index === 2 ? "7" : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrayVisual() {
  return (
    <div style={visualBox}>
      <div style={visualLead}>Equal rows and columns make multiplication visible.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,42px)", gap: 10, marginTop: 18, justifyContent: "center" }}>
        {Array.from({ length: 12 }, (_, index) => <span key={index} style={{ width: 42, height: 42, borderRadius: 12, background: index < 8 ? "var(--s-primary)" : "var(--s-success)" }} />)}
      </div>
      <div style={{ textAlign: "center", color: "var(--s-muted)", fontWeight: 900, marginTop: 14 }}>3 rows × 4 columns = 12</div>
    </div>
  );
}

function TextEvidenceVisual() {
  return (
    <div style={visualBox}>
      <div style={visualLead}>Strong reading answers use a claim plus evidence.</div>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <div style={evidenceLine}>1. Say what you think.</div>
        <div style={evidenceLine}>2. Point to words from the text.</div>
        <div style={evidenceLine}>3. Explain how the evidence proves it.</div>
      </div>
    </div>
  );
}

function StepsVisual() {
  return (
    <div style={visualBox}>
      <div style={visualLead}>A reliable strategy keeps the work tidy.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 16 }}>
        {["Read", "Model", "Check"].map((step, index) => (
          <div key={step} style={{ background: index === 1 ? "var(--s-primary)" : "#fff", color: index === 1 ? "#fff" : "var(--s-muted)", borderRadius: 14, padding: 16, textAlign: "center", fontWeight: 900 }}>{step}</div>
        ))}
      </div>
    </div>
  );
}

function ExampleRow({ num, text, tone }: { num: number; text: string; tone: "primary" | "success" }) {
  const color = tone === "success" ? "var(--s-success)" : "var(--s-primary)";
  return (
    <div style={{ background: "#FBF4EA", borderRadius: 14, padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", background: color, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900, flex: "none" }}>{num}</span>
      <span style={{ fontWeight: 900, color: "#38304F", lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}

function pill(bg: string, color: string): React.CSSProperties {
  return { background: bg, color, borderRadius: 999, padding: "7px 12px", fontWeight: 900, fontSize: 12 };
}

function navLink(active: boolean): React.CSSProperties {
  return {
    color: active ? "var(--s-primary-ink)" : "var(--s-muted)",
    padding: "8px 9px",
    borderRadius: 9,
  };
}

function subjectLessonButton(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    padding: "9px 15px",
    fontWeight: 900,
    fontSize: 13,
    background: active ? "var(--s-primary)" : "#fff",
    color: active ? "#fff" : "var(--s-muted)",
    border: active ? "2px solid var(--s-primary)" : "2px solid #ECE7F4",
  };
}

const lessonCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 26,
  padding: 34,
  marginTop: 18,
  boxShadow: "0 18px 45px rgba(54,48,74,.08)",
};

const lessonTools: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 16,
};

const pdfButton: React.CSSProperties = {
  border: "1px solid #E2D8F7",
  background: "#fff",
  color: "var(--s-primary-ink)",
  borderRadius: 13,
  padding: "10px 15px",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(54,48,74,.06)",
};

const lessonTitle: React.CSSProperties = {
  fontFamily: "'Baloo 2', sans-serif",
  fontWeight: 800,
  fontSize: 32,
  lineHeight: 1.05,
  margin: "0 0 10px",
};

const lessonCopy: React.CSSProperties = {
  color: "var(--s-muted)",
  fontWeight: 800,
  fontSize: 16,
  lineHeight: 1.5,
  margin: "0 0 22px",
};

const smallHeading: React.CSSProperties = {
  color: "var(--s-muted)",
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: ".04em",
  textTransform: "uppercase",
  margin: "20px 0 10px",
};

const visualBox: React.CSSProperties = {
  background: "#FBF4EA",
  borderRadius: 20,
  padding: 24,
  marginBottom: 24,
};

const visualLead: React.CSSProperties = {
  color: "#38304F",
  fontWeight: 900,
  fontSize: 15,
};

const evidenceLine: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "12px 14px",
  color: "#38304F",
  fontWeight: 900,
};

function bodyHeading(level: 2 | 3 | 4 | undefined): React.CSSProperties {
  return {
    fontFamily: "'Baloo 2', sans-serif",
    fontWeight: 800,
    fontSize: level === 4 ? 19 : level === 3 ? 22 : 26,
    lineHeight: 1.15,
    color: "var(--s-ink)",
    margin: level === 2 ? "10px 0 0" : "4px 0 0",
  };
}

const bodyParagraph: React.CSSProperties = {
  margin: 0,
  color: "#443D58",
  fontWeight: 800,
  fontSize: 16,
  lineHeight: 1.65,
};

const bodyParagraphBox: React.CSSProperties = {
  ...bodyParagraph,
  background: "#FBF9F4",
  border: "1px solid #ECE2CF",
  borderRadius: 14,
  padding: "14px 16px",
};

const bodyList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 24,
  color: "#443D58",
  fontWeight: 800,
  fontSize: 15,
  lineHeight: 1.65,
};

const svgFigure: React.CSSProperties = {
  margin: 0,
  background: "#FBF4EA",
  borderRadius: 18,
  padding: 18,
};

const svgWrap: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
};

const svgCaption: React.CSSProperties = {
  marginTop: 10,
  color: "var(--s-muted)",
  fontWeight: 900,
  fontSize: 13,
  textAlign: "center",
};

function calloutBox(tone: "info" | "success" | "warning"): React.CSSProperties {
  const palette = {
    info: { bg: "var(--s-primary-soft)", color: "var(--s-primary-ink)" },
    success: { bg: "var(--s-success-soft)", color: "#0E7A55" },
    warning: { bg: "var(--s-accent-soft)", color: "#C2491F" },
  }[tone];
  return {
    background: palette.bg,
    color: palette.color,
    borderRadius: 14,
    padding: "14px 16px",
  };
}

const calloutTitle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 15,
  marginBottom: 4,
};

const calloutText: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 14.5,
  lineHeight: 1.5,
};

const lessonExampleCard: React.CSSProperties = {
  background: "#FBF4EA",
  borderRadius: 16,
  padding: "16px 18px",
};

function lessonOption(correct: boolean): React.CSSProperties {
  return {
    background: correct ? "var(--s-success-soft)" : "#fff",
    color: correct ? "#0E7A55" : "#443D58",
    border: correct ? "2px solid var(--s-success)" : "2px solid #ECE7F4",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    fontSize: 14,
  };
}

const showAnswerButton: React.CSSProperties = {
  border: "none",
  background: "var(--s-primary)",
  color: "#fff",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 900,
  fontSize: 13,
  marginTop: 12,
  cursor: "pointer",
};

const answerBox: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "13px 15px",
  marginTop: 12,
  border: "2px solid #E6F4EC",
};

const richParagraph: React.CSSProperties = {
  margin: 0,
  color: "#38304F",
  fontWeight: 800,
  fontSize: 15,
  lineHeight: 1.5,
};

const mathText: React.CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  background: "#fff",
  border: "1px solid #ECE7F4",
  borderRadius: 8,
  padding: "4px 7px",
  color: "var(--s-primary-ink)",
  fontWeight: 900,
};

const codeText: React.CSSProperties = {
  ...mathText,
  fontFamily: "ui-monospace, Menlo, monospace",
};

const blankText: React.CSSProperties = {
  display: "inline-flex",
  minWidth: 56,
  borderBottom: "2px solid var(--s-primary)",
};

const practiceButton: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  border: "none",
  background: "var(--s-primary)",
  color: "#fff",
  borderRadius: 16,
  padding: 17,
  fontFamily: "'Baloo 2', sans-serif",
  fontWeight: 800,
  fontSize: 18,
  boxShadow: "0 12px 24px rgba(108,76,224,.22)",
};
