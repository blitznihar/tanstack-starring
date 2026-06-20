import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AdminParentShell } from "~/components/AppShell";
import { exportProfileFn, previewImportFn, importProfileFn } from "~/server/rpc/profile";
import { me, logout } from "~/server/rpc/session";

export const Route = createFileRoute("/admin/profile")({
  loader: async () => ({ user: await me() }),
  component: ProfileIO,
});

type Preview = Awaited<ReturnType<typeof previewImportFn>>;

function ProfileIO() {
  const { user } = Route.useLoaderData();
  const navigate = useNavigate();
  const doExport = useServerFn(exportProfileFn);
  const doPreview = useServerFn(previewImportFn);
  const doImport = useServerFn(importProfileFn);
  const doLogout = useServerFn(logout);

  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  async function exportNow() {
    setBusy(true);
    try {
      const r = await doExport({ data: {} });
      // Trigger a browser download of the JSON.
      const blob = new Blob([r.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      setExported(`Exported ${r.studentId} @ ${r.exportedAt}`);
    } finally {
      setBusy(false);
    }
  }

  async function previewNow() {
    setApplied(null);
    setPreview(await doPreview({ data: { json } }));
  }
  async function confirmImport() {
    setBusy(true);
    try {
      const r = await doImport({ data: { json, confirm: true } });
      setApplied(r.applied ? `Imported — ${r.decision.reason}` : `Skipped — ${r.decision.reason}`);
      setPreview(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminParentShell
      user={user}
      active="profiles"
      onLogout={async () => { await doLogout({}); navigate({ to: "/" }); }}
    >
      <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 22px 60px", display: "grid", gap: 18 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Export / import a student profile</h1>
        <p style={{ color: "var(--a-muted)", fontWeight: 600, marginTop: 0 }}>
          Move a whole student — enrollments, responses, exams, mastery, Robux, schedules — between machines. Content is never included. Import is last-write-wins by export time, with a preview before any overwrite.
        </p>

        <section className="a-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Export</h2>
          <p style={{ margin: "0 0 14px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>Downloads the current student's profile as JSON.</p>
          <button onClick={exportNow} disabled={busy} style={{ border: "none", background: "var(--a-accent)", color: "#fff", fontWeight: 800, fontSize: 13.5, padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
            {busy ? "Working…" : "Export profile JSON"}
          </button>
          {exported && <div style={{ marginTop: 10, color: "var(--a-good)", fontWeight: 700, fontSize: 13 }}>{exported}</div>}
        </section>

        <section className="a-card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Import</h2>
          <p style={{ margin: "0 0 12px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>Paste an exported profile JSON, preview the decision, then confirm.</p>
          <textarea value={json} onChange={(e) => { setJson(e.target.value); setPreview(null); setApplied(null); }} placeholder="Paste profile JSON here…"
            style={{ width: "100%", height: 160, boxSizing: "border-box", fontFamily: "ui-monospace, monospace", fontSize: 12.5, border: "1px solid var(--a-border)", borderRadius: 10, padding: 12, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={previewNow} disabled={!json.trim() || busy} style={{ border: "1px solid var(--a-border)", background: "#fff", fontWeight: 800, fontSize: 13, padding: "9px 14px", borderRadius: 10, cursor: "pointer" }}>Preview</button>
            {preview?.ok && preview.decision.action === "apply" && !applied && (
              <button onClick={confirmImport} disabled={busy} style={{ border: "none", background: "var(--s-success)", color: "#fff", fontWeight: 800, fontSize: 13, padding: "9px 16px", borderRadius: 10, cursor: "pointer" }}>
                {busy ? "Importing…" : "Confirm import (overwrite)"}
              </button>
            )}
          </div>

          {preview && (
            <div style={{ marginTop: 14, border: "1px solid var(--a-border2)", borderRadius: 10, padding: 14 }}>
              {!preview.ok ? (
                <div style={{ color: "var(--a-bad)", fontWeight: 700, fontSize: 13 }}>Invalid file: {preview.error}</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span className="pill" style={{ background: preview.decision.action === "apply" ? "var(--a-good-soft)" : "var(--a-warn-soft)", color: preview.decision.action === "apply" ? "var(--a-good)" : "var(--a-warn)" }}>
                      {preview.decision.action === "apply" ? "Will replace" : "Will skip (not newer)"}
                    </span>
                    <span style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>student {preview.studentId}</span>
                  </div>
                  <div style={{ color: "var(--a-muted)", fontWeight: 600, fontSize: 12.5, marginBottom: 10 }}>{preview.decision.reason}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {Object.entries(preview.counts).map(([k, v]) => (
                      <span key={k} style={{ background: "var(--a-border2)", borderRadius: 8, padding: "4px 10px", fontWeight: 700, fontSize: 12 }}>{k}: {v}</span>
                    ))}
                  </div>
                  {applied && <div style={{ marginTop: 12, color: "var(--a-good)", fontWeight: 800, fontSize: 13 }}>{applied}</div>}
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </AdminParentShell>
  );
}
