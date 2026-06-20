import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { contentTree, bundleDetail, refillPrompt, uploadContentJson } from "~/server/rpc/content";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/admin/content")({
  loader: async () => ({ tree: await contentTree(), user: await me() }),
  component: ContentBrowser,
});

type Detail = Awaited<ReturnType<typeof bundleDetail>>;

const STATUS_CLASS: Record<string, string> = { ok: "pill-ok", running_low: "pill-low", exhausted: "pill-exhausted" };
const STATUS_LABEL: Record<string, string> = { ok: "ok", running_low: "running low", exhausted: "exhausted" };

function ContentBrowser() {
  const { tree: initialTree, user } = Route.useLoaderData();
  const navigate = useNavigate();
  const loadDetail = useServerFn(bundleDetail);
  const genRefill = useServerFn(refillPrompt);
  const doUploadContent = useServerFn(uploadContentJson);
  const doLogout = useServerFn(logout);

  const [tree, setTree] = useState(initialTree);
  const [open, setOpen] = useState<{ bundleId: string; programKey: string; subject: string; title: string } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  async function openBundle(b: { bundleId: string; programKey: string; subject: string; title: string }) {
    setOpen(b);
    setDetail(null);
    setLoading(true);
    setDetail(await loadDetail({ data: { bundleId: b.bundleId, programKey: b.programKey, subject: b.subject } }));
    setLoading(false);
  }

  async function showRefill(programKey: string, subject: string) {
    setPrompt("Generating…");
    setPrompt(await genRefill({ data: { programKey, subjects: [subject] } }));
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
          <Link to="/admin/profile" style={{ color: "var(--a-muted)" }}>Profile I/O</Link>
          <Link to="/billing" style={{ color: "var(--a-muted)" }}>Billing</Link>
        </nav>
        <div style={{ flex: 1 }} />
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
              <label style={btn(false)}>
                {uploading === program.programKey ? "Uploading..." : "Upload content"}
                <input type="file" accept=".json,application/json" onChange={(e) => uploadForProgram(program.programKey, e.target.files?.[0] ?? null)} style={{ display: "none" }} />
              </label>
            </div>
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
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={() => openBundle({ bundleId: b.bundleId, programKey: program.programKey, subject: b.subject, title: b.title })} style={btn(true)}>
                        {b.viewLabel}
                      </button>
                      <button onClick={() => showRefill(program.programKey, b.subject)} style={btn(false)} title="Generate offline authoring prompt for low/exhausted pools">
                        Refill prompt
                      </button>
                    </div>
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
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <span className="pill" style={{ background: "var(--a-accent-soft)", color: "var(--a-accent)" }}>{it.standardCodes.join(", ")}</span>
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

      {/* refill prompt modal */}
      {prompt !== null && (
        <Modal onClose={() => setPrompt(null)} title="Refill authoring prompt (paste into any LLM offline)">
          <textarea readOnly value={prompt} style={{ width: "100%", height: 380, fontFamily: "ui-monospace, monospace", fontSize: 12.5, border: "1px solid var(--a-border)", borderRadius: 10, padding: 12, resize: "vertical" }} />
          <button onClick={() => navigator.clipboard?.writeText(prompt)} style={{ ...btn(true), marginTop: 10 }}>Copy</button>
        </Modal>
      )}
    </div>
  );
}

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
