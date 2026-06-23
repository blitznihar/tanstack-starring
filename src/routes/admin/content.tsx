import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { NotificationBell } from "~/components/NotificationBell";
import { SourceBadge } from "~/components/SourceBadge";
import { contentTree, bundleDetail, lessonsDetail, lessonPrompt, refillPrompt, uploadContentJson, uploadLessonJson } from "~/server/rpc/content";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/admin/content")({
  loader: async () => ({ tree: await contentTree(), user: await me() }),
  component: ContentBrowser,
});

type Detail = Awaited<ReturnType<typeof bundleDetail>>;
type LessonDetail = Awaited<ReturnType<typeof lessonsDetail>>;

const STATUS_CLASS: Record<string, string> = { ok: "pill-ok", running_low: "pill-low", exhausted: "pill-exhausted" };
const STATUS_LABEL: Record<string, string> = { ok: "ok", running_low: "running low", exhausted: "exhausted" };

function ContentBrowser() {
  const { tree: initialTree, user } = Route.useLoaderData();
  const navigate = useNavigate();
  const loadDetail = useServerFn(bundleDetail);
  const loadLessons = useServerFn(lessonsDetail);
  const genRefill = useServerFn(refillPrompt);
  const genLessonPrompt = useServerFn(lessonPrompt);
  const doUploadContent = useServerFn(uploadContentJson);
  const doUploadLesson = useServerFn(uploadLessonJson);
  const doLogout = useServerFn(logout);
  const canImportContent = !!user?.roles.includes("super_admin");

  const [tree, setTree] = useState(initialTree);
  const [open, setOpen] = useState<{ bundleId: string; programKey: string; subject: string; title: string } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openLessons, setOpenLessons] = useState<{ programKey: string; subject?: string; title: string } | null>(null);
  const [lessonDetail, setLessonDetail] = useState<LessonDetail | null>(null);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptTitle, setPromptTitle] = useState("Authoring prompt");
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  async function openBundle(b: { bundleId: string; programKey: string; subject: string; title: string }) {
    setOpen(b);
    setDetail(null);
    setLoading(true);
    setDetail(await loadDetail({ data: { bundleId: b.bundleId, programKey: b.programKey, subject: b.subject } }));
    setLoading(false);
  }

  async function openLessonBrowser(input: { programKey: string; subject?: string; title: string }) {
    setOpenLessons(input);
    setLessonDetail(null);
    setLoadingLessons(true);
    try {
      setLessonDetail(await loadLessons({ data: { programKey: input.programKey, subject: input.subject } }));
    } finally {
      setLoadingLessons(false);
    }
  }

  async function showRefill(programKey: string, subject: string) {
    setPromptTitle("Refill authoring prompt (paste into any LLM offline)");
    setPrompt("Generating…");
    setPrompt(await genRefill({ data: { programKey, subjects: [subject] } }));
  }

  async function showLessonPrompt(programKey: string, subject: string) {
    setPromptTitle("Lesson authoring prompt (paste into any LLM offline)");
    setPrompt("Generating…");
    setPrompt(await genLessonPrompt({ data: { programKey, subject } }));
  }

  async function uploadForProgram(programKey: string, file: File | null) {
    if (!file) return;
    setUploading(programKey);
    setUploadMessage(null);
    try {
      const result = await doUploadContent({ data: { programKey, json: await file.text() } });
      setTree(result.tree);
      const items = result.results.reduce((sum, row) => sum + row.itemCount, 0);
      setUploadMessage(`Imported ${result.results.length} bundle(s) and ${items} item(s).`);
    } catch (e) {
      setUploadMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  async function uploadLessonsForProgram(programKey: string, file: File | null) {
    if (!file) return;
    setUploading(`${programKey}:lessons`);
    setUploadMessage(null);
    try {
      const result = await doUploadLesson({ data: { programKey, json: await file.text() } });
      setTree(result.tree);
      setUploadMessage(`Imported ${result.result.lessonCount} lesson(s) for ${result.result.subjects.join(", ")}.`);
    } catch (e) {
      setUploadMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="a-shell">
      {/* top bar */}
      <header style={{ background: "var(--a-surface)", borderBottom: "1px solid var(--a-border)", padding: "14px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff" }} />
        </div>
        <strong style={{ fontSize: 16 }}>Comet Console</strong>
        <nav style={{ display: "flex", gap: 14, marginLeft: 8, fontWeight: 700, fontSize: 13 }}>
          <span style={{ color: "var(--a-accent)" }}>Content</span>
          <Link to="/admin/rewards" style={{ color: "var(--a-muted)" }}>Rewards</Link>
          <Link to="/scoring" style={{ color: "var(--a-muted)" }}>Scoring</Link>
          <Link to="/dashboard" style={{ color: "var(--a-muted)" }}>Reports</Link>
          <Link to="/history" style={{ color: "var(--a-muted)" }}>History</Link>
          <Link to="/admin/profile" style={{ color: "var(--a-muted)" }}>Profile I/O</Link>
          <Link to="/billing" style={{ color: "var(--a-muted)" }}>Billing</Link>
        </nav>
        <div style={{ flex: 1 }} />
        <NotificationBell tone="admin" />
        <span style={{ color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>{user?.displayName} ({user?.roles.join(", ")})</span>
        <button onClick={async () => { await doLogout({}); navigate({ to: "/" }); }} style={{ border: "1px solid var(--a-border)", background: "#fff", fontWeight: 700, fontSize: 13, padding: "7px 12px", borderRadius: 9, cursor: "pointer" }}>
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 22px 60px" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Content</h1>
        <p style={{ color: "var(--a-muted)", fontWeight: 600, marginTop: 0 }}>
          Programs at the top level. Open any bundle to browse every item, with usage counts and pool health.
        </p>

        {tree.map((program) => (
          <section key={program.programKey} className="a-card" style={{ padding: 20, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>{program.programTitle}</h2>
              <span style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0 }}>{program.category}</span>
              <div style={{ flex: 1 }} />
              {canImportContent && (
                <>
                  <label style={btn(false)}>
                    {uploading === program.programKey ? "Uploading..." : "Upload content"}
                    <input type="file" accept=".json,application/json" onChange={(e) => uploadForProgram(program.programKey, e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                  </label>
                  <label style={btn(false)}>
                    {uploading === `${program.programKey}:lessons` ? "Uploading..." : "Upload lessons"}
                    <input type="file" accept=".json,application/json" onChange={(e) => uploadLessonsForProgram(program.programKey, e.target.files?.[0] ?? null)} style={{ display: "none" }} />
                  </label>
                </>
              )}
            </div>
            {program.lessonCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <span style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 12.5 }}>
                  {program.lessonCount} authored lesson{program.lessonCount === 1 ? "" : "s"} uploaded
                </span>
                <button
                  onClick={() => openLessonBrowser({ programKey: program.programKey, title: `${program.programTitle} lessons` })}
                  style={btn(false)}
                >
                  View {program.lessonCount} lesson{program.lessonCount === 1 ? "" : "s"}
                </button>
              </div>
            )}
            {uploadMessage && uploading !== program.programKey && (
              <div style={{ color: uploadMessage.startsWith("Imported") ? "var(--a-good)" : "var(--a-bad)", fontWeight: 800, fontSize: 12.5, marginTop: 8 }}>{uploadMessage}</div>
            )}
            {program.bundles.length === 0 ? (
              <p style={{ color: "var(--a-faint)", fontWeight: 600, fontSize: 13, marginBottom: 0 }}>No content imported yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12, marginTop: 14 }}>
                {program.bundles.map((b) => (
                  <div key={b.bundleId} style={{ border: "1px solid var(--a-border)", borderRadius: 12, padding: 14 }}>
                    <div style={{ fontWeight: 800 }}>{b.title}</div>
                    <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 12, marginTop: 2 }}>
                      {b.subject} · v{b.version} · <span style={{ color: b.status === "available" ? "var(--a-good)" : "var(--a-faint)" }}>{b.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <button onClick={() => openBundle({ bundleId: b.bundleId, programKey: program.programKey, subject: b.subject, title: b.title })} style={btn(true)}>
                        {b.viewLabel}
                      </button>
                      {program.lessons.filter((lesson) => lesson.subject === b.subject && lesson.status !== "archived").length > 0 && (
                        <button
                          onClick={() => openLessonBrowser({ programKey: program.programKey, subject: b.subject, title: `${program.programTitle} ${b.subject} lessons` })}
                          style={btn(true)}
                        >
                          View {program.lessons.filter((lesson) => lesson.subject === b.subject && lesson.status !== "archived").length} lesson{program.lessons.filter((lesson) => lesson.subject === b.subject && lesson.status !== "archived").length === 1 ? "" : "s"}
                        </button>
                      )}
                      {canImportContent && (
                        <>
                          <button onClick={() => showRefill(program.programKey, b.subject)} style={btn(false)} title="Generate offline authoring prompt for low/exhausted pools">
                            Refill prompt
                          </button>
                          <button onClick={() => showLessonPrompt(program.programKey, b.subject)} style={btn(false)} title="Generate offline lesson authoring prompt">
                            Lesson prompt
                          </button>
                        </>
                      )}
                    </div>
                    {program.lessons.filter((lesson) => lesson.subject === b.subject && lesson.status !== "archived").length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {program.lessons
                          .filter((lesson) => lesson.subject === b.subject && lesson.status !== "archived")
                          .slice(0, 3)
                          .map((lesson) => (
                            <span key={lesson.lessonId} className="pill" style={{ background: "var(--a-good-soft)", color: "var(--a-good)" }}>
                              {lesson.standardCode} lesson
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>

      {/* bundle drawer */}
      {open && (
        <Modal onClose={() => setOpen(null)} title={open.title}>
          {loading || !detail ? (
            <p style={{ color: "var(--a-muted)", fontWeight: 600 }}>Loading items…</p>
          ) : (
            <>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Item pools</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                {detail.pools.map((p) => (
                  <span key={p.key} className={`pill ${STATUS_CLASS[p.status]}`} title={`unused ${p.unused}/${p.total} · need ${p.need}`}>
                    <span className="dot" /> {p.standardCode} · {p.conceptName} · {p.unused}/{p.total} [{STATUS_LABEL[p.status]}]
                  </span>
                ))}
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>{detail.items.length} items</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detail.items.map((it) => (
                  <div key={it._id} style={{ border: "1px solid var(--a-border2)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <span className="pill" style={{ background: "var(--a-accent-soft)", color: "var(--a-accent)" }}>{it.standardCodes.join(", ")}</span>
                      <SourceBadge source={it.source} />
                      <span style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 11 }}>{it.type} · {it.difficulty}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 11 }}>used {it.usageCount}×</span>
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>{it.prompt}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {it.options.map((o) => (
                        <div key={o.key} style={{ fontSize: 13, color: o.correct ? "var(--a-good)" : "var(--a-muted)", fontWeight: o.correct ? 800 : 600 }}>
                          {o.correct ? "✓" : "·"} {o.key}. {o.text}
                          {!o.correct && o.rationale ? <span style={{ color: "var(--a-faint)", fontWeight: 600 }}> — {o.rationale}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {/* lesson drawer */}
      {openLessons && (
        <Modal onClose={() => setOpenLessons(null)} title={openLessons.title}>
          {loadingLessons || !lessonDetail ? (
            <p style={{ color: "var(--a-muted)", fontWeight: 600 }}>Loading lessons...</p>
          ) : lessonDetail.lessons.length === 0 ? (
            <p style={{ color: "var(--a-muted)", fontWeight: 700 }}>No authored lessons uploaded yet.</p>
          ) : (
            <LessonList lessons={lessonDetail.lessons} />
          )}
        </Modal>
      )}

      {/* refill prompt modal */}
      {prompt !== null && (
        <Modal onClose={() => setPrompt(null)} title={promptTitle}>
          <textarea readOnly value={prompt} style={{ width: "100%", height: 380, fontFamily: "ui-monospace, monospace", fontSize: 12.5, border: "1px solid var(--a-border)", borderRadius: 10, padding: 12, resize: "vertical" }} />
          <button onClick={() => navigator.clipboard?.writeText(prompt)} style={{ ...btn(true), marginTop: 10 }}>Copy</button>
        </Modal>
      )}
    </div>
  );
}

function LessonList({ lessons }: { lessons: LessonDetail["lessons"] }) {
  const [preview, setPreview] = useState<LessonDetail["lessons"][number] | null>(null);
  if (preview) return <StudentLessonPreview lesson={preview} onClose={() => setPreview(null)} />;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {lessons.map((lesson) => (
        <section key={lesson._id} style={{ border: "1px solid var(--a-border2)", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span className="pill" style={{ background: "var(--a-accent-soft)", color: "var(--a-accent)" }}>{lesson.subject} · {lesson.standardCode}</span>
            <span className="pill" style={{ background: lesson.status === "available" ? "var(--a-good-soft)" : "var(--a-border2)", color: lesson.status === "available" ? "var(--a-good)" : "var(--a-faint)" }}>v{lesson.version} · {lesson.status}</span>
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{lesson.title}</h3>
          {lesson.intro && <p style={{ margin: "0 0 10px", color: "var(--a-muted)", fontWeight: 700, fontSize: 13.5, lineHeight: 1.5 }}>{lesson.intro}</p>}
          {lesson.vocabulary.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {lesson.vocabulary.map((word) => (
                <span key={word.term} className="pill" style={{ background: "#F7F4EF", color: "var(--a-muted)" }}>
                  {word.term}: {word.meaning}
                </span>
              ))}
            </div>
          )}
          {lesson.body.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              {lesson.body.map((block, index) => (
                <div key={`${block.kind}:${index}`} style={{ background: "#F7F8FB", border: "1px solid var(--a-border)", borderRadius: 9, padding: "9px 11px" }}>
                  <div style={{ color: "var(--a-faint)", fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: 0 }}>{block.label}</div>
                  <div style={{ color: "var(--a-ink)", fontWeight: 700, fontSize: 13, lineHeight: 1.45 }}>{block.text || "(empty block)"}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontWeight: 900, fontSize: 12.5, color: "var(--a-muted)", marginBottom: 6 }}>
            {lesson.practiceExamples.length} lesson practice example{lesson.practiceExamples.length === 1 ? "" : "s"}
          </div>
          <button onClick={() => setPreview(lesson)} style={{ ...btn(false), marginBottom: lesson.practiceExamples.length > 0 ? 10 : 0 }}>
            View in Student Mode
          </button>
          {lesson.practiceExamples.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {lesson.practiceExamples.map((example) => (
                <div key={example.id} style={{ border: "1px solid var(--a-border)", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>{example.prompt}</div>
                  {example.options.map((option) => (
                    <div key={option.key} style={{ color: option.correct ? "var(--a-good)" : "var(--a-muted)", fontWeight: option.correct ? 900 : 700, fontSize: 12.5 }}>
                      {option.correct ? "✓" : "·"} {option.key}. {option.text}
                      {!option.correct && option.rationale ? <span style={{ color: "var(--a-faint)" }}> - {option.rationale}</span> : null}
                    </div>
                  ))}
                  {example.answer && <div style={{ color: "var(--a-good)", fontWeight: 800, fontSize: 12.5, marginTop: 6 }}>Answer: {example.answer}</div>}
                  {example.explanation && <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5, marginTop: 3 }}>{example.explanation}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function StudentLessonPreview({ lesson, onClose }: { lesson: LessonDetail["lessons"][number]; onClose: () => void }) {
  return (
    <div style={{ background: "var(--s-bg)", borderRadius: 14, padding: 18, color: "var(--s-ink)", fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ color: "var(--s-muted)", fontWeight: 900, fontSize: 12 }}>Student Mode Preview</div>
          <h2 style={{ margin: "2px 0 0", fontFamily: "'Baloo 2', sans-serif", fontSize: 26 }}>{lesson.title}</h2>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={btn(false)}>Close Student Mode</button>
      </div>
      <section style={{ background: "#fff", borderRadius: 22, padding: 24, boxShadow: "0 8px 22px rgba(54,48,74,.06)" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={studentPill}>TEKS {lesson.standardCode}</span>
          <span style={{ ...studentPill, background: "#D9F0FF", color: "#1B76A0" }}>{lesson.subject} · Lesson</span>
        </div>
        {lesson.intro && <p style={studentParagraph}>{lesson.intro}</p>}
        {lesson.vocabulary.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "0 0 18px" }}>
            {lesson.vocabulary.map((word) => (
              <span key={word.term} style={{ background: "#FBF4EA", borderRadius: 12, padding: "10px 14px", color: "var(--s-muted)", fontWeight: 900, fontSize: 13 }}>
                <b style={{ color: "var(--s-primary-ink)" }}>{word.term}</b> - {word.meaning}
              </span>
            ))}
          </div>
        )}
        <StudentLessonBody blocks={lesson.studentBody} />
        {lesson.studentPracticeExamples.length > 0 && (
          <>
            <h3 style={studentHeading}>Practice examples</h3>
            <div style={{ display: "grid", gap: 12 }}>
              {lesson.studentPracticeExamples.map((example, index) => (
                <StudentPracticeExample key={example.id ?? index} example={example} num={index + 1} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StudentLessonBody({ blocks }: { blocks: LessonDetail["lessons"][number]["studentBody"] }) {
  if (blocks.length === 0) return <p style={studentParagraph}>This lesson uses the generated student visual in the student screen.</p>;
  return (
    <div style={{ display: "grid", gap: 14, margin: "0 0 22px" }}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") return <h3 key={index} style={studentHeading}>{block.text}</h3>;
        if (block.kind === "paragraph") {
          if (block.html) return <div key={index} style={studentBox} dangerouslySetInnerHTML={{ __html: sanitizeMarkup(block.html) }} />;
          return <p key={index} style={studentParagraph}>{block.text}</p>;
        }
        if (block.kind === "html") return <div key={index} style={studentBox} dangerouslySetInnerHTML={{ __html: sanitizeMarkup(block.html) }} />;
        if (block.kind === "svg") return <figure key={index} style={studentBox}><div dangerouslySetInnerHTML={{ __html: sanitizeMarkup(block.svg) }} /><figcaption style={{ color: "var(--s-muted)", fontWeight: 800, fontSize: 12 }}>{block.caption ?? block.alt}</figcaption></figure>;
        if (block.kind === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return <Tag key={index} style={studentParagraph}>{block.items.map((item) => <li key={item}>{item}</li>)}</Tag>;
        }
        return <div key={index} style={studentBox}>{block.title && <b>{block.title}</b>} {block.text}</div>;
      })}
    </div>
  );
}

function StudentPracticeExample({ example, num }: { example: LessonDetail["lessons"][number]["studentPracticeExamples"][number]; num: number }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ border: "2px solid #EFEAF7", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{num}.</div>
      <RichPreview content={example.prompt} />
      {example.options.map((option) => (
        <div key={option.key} style={{ border: "2px solid #ECE7F4", borderRadius: 12, padding: "10px 12px", marginTop: 8, fontWeight: 800, background: show && option.correct ? "var(--s-success-soft)" : "#fff", color: show && option.correct ? "#0E7A55" : "var(--s-ink)" }}>
          {option.key}. {option.text}
        </div>
      ))}
      <button onClick={() => setShow((value) => !value)} style={{ ...btn(false), marginTop: 10 }}>{show ? "Hide answer" : "Show answer"}</button>
      {show && <div style={{ ...studentBox, background: "var(--s-success-soft)", color: "#0E7A55", marginTop: 10 }}><RichPreview content={example.answer} />{example.explanation.length > 0 && <RichPreview content={example.explanation} />}</div>}
    </div>
  );
}

function RichPreview({ content }: { content: LessonDetail["lessons"][number]["studentPracticeExamples"][number]["prompt"] }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {content.map((node, index) => {
        if (typeof node === "string") return <p key={index} style={studentParagraph}>{node}</p>;
        if (node.kind === "heading") return <h3 key={index} style={studentHeading}>{node.text}</h3>;
        if (node.kind === "list") return <ul key={index} style={studentParagraph}>{(node.items ?? []).map((item) => <li key={item}>{item}</li>)}</ul>;
        if (node.kind === "math" || node.kind === "code") return <code key={index}>{node.text}</code>;
        if (node.kind === "blank") return <span key={index} style={{ display: "inline-block", minWidth: 70, borderBottom: "2px solid var(--s-muted)" }} />;
        return <p key={index} style={studentParagraph}>{node.text ?? ""}</p>;
      })}
    </div>
  );
}

function sanitizeMarkup(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

const studentPill: React.CSSProperties = { background: "var(--s-primary-soft)", color: "var(--s-primary-ink)", borderRadius: 999, padding: "7px 12px", fontWeight: 900, fontSize: 12 };
const studentHeading: React.CSSProperties = { fontFamily: "'Baloo 2', sans-serif", fontSize: 20, margin: "10px 0 8px", color: "var(--s-ink)" };
const studentParagraph: React.CSSProperties = { margin: 0, color: "var(--s-ink)", fontWeight: 700, lineHeight: 1.6 };
const studentBox: React.CSSProperties = { border: "2px solid #EFEAF7", borderRadius: 14, padding: 14, background: "#fff", color: "var(--s-ink)", fontWeight: 700, lineHeight: 1.55 };

function btn(primary: boolean): React.CSSProperties {
  return {
    border: primary ? "none" : "1px solid var(--a-border)",
    background: primary ? "var(--a-accent)" : "#fff",
    color: primary ? "#fff" : "var(--a-ink)",
    fontWeight: 700,
    fontSize: 12.5,
    padding: "8px 12px",
    borderRadius: 9,
    cursor: "pointer",
  };
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(19,26,42,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 20px", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="a-card" style={{ width: "100%", maxWidth: 760, maxHeight: "88vh", overflow: "auto", padding: 22, animation: "cometfade .15s ease" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ border: "none", background: "var(--a-border2)", width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontWeight: 800 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
