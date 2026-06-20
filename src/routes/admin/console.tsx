import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AdminParentShell } from "~/components/AppShell";
import { billingOverview } from "~/server/rpc/billing";
import {
  addProgram,
  consoleSnapshot,
  createConsoleUser,
  deleteConsoleUser,
  resetConsoleUserPassword,
  setProgramStatus,
  setStudentProgram,
  updateConsoleUser,
  uploadProgramJson,
} from "~/server/rpc/adminConsole";
import { bundleDetail, newProgramPrompt } from "~/server/rpc/content";
import { exportProfileFn, importProfileFn, previewImportFn } from "~/server/rpc/profile";
import {
  adminApprove,
  adminCreateRedemption,
  adminFulfill,
  adminGrantRobux,
  adminRedemptions,
  robuxRules,
  rewardRulesList,
  saveRewardRule,
  saveRobuxRules,
} from "~/server/rpc/gamification";
import { scoringQueue } from "~/server/rpc/scoring";
import { me, logout } from "~/server/rpc/session";
import type { Role } from "~/schemas/common";

export const Route = createFileRoute("/admin/console")({
  loader: async () => ({
    user: await me(),
    snapshot: await consoleSnapshot(),
    rules: await robuxRules({ data: { programKey: "grade3_staar" } }),
    rewards: await rewardRulesList(),
    redemptions: await adminRedemptions(),
    scoring: await scoringQueue(),
    billing: await billingOverview(),
  }),
  component: ConsolePage,
});

type TabKey = "users" | "programs" | "content" | "exams" | "scoring" | "redemptions" | "billing" | "profiles";
type Snapshot = Awaited<ReturnType<typeof consoleSnapshot>>;
type BundleDetail = Awaited<ReturnType<typeof bundleDetail>>;
type Rules = Awaited<ReturnType<typeof robuxRules>>;
type Rewards = Awaited<ReturnType<typeof rewardRulesList>>;
type Redemptions = Awaited<ReturnType<typeof adminRedemptions>>;
type ScoringRows = Awaited<ReturnType<typeof scoringQueue>>;
type Billing = Awaited<ReturnType<typeof billingOverview>>;
type Preview = Awaited<ReturnType<typeof previewImportFn>>;
type ProgramStatus = Snapshot["programs"][number]["status"];
type ProgramPromptDraft = { programTitle: string; category?: string; subjects: string[]; targetDays: number; itemsPerSubject?: number };
type UserDraft = { username: string; displayName: string; roles: Role[]; forceChangeOnFirstLogin: boolean };
type UserUpdateDraft = UserDraft & { id: string; active: boolean };
type ProgramUploadResult = { programKey: string; programTitle: string; bundleCount: number; itemCount: number };

const TABS: { key: TabKey; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "programs", label: "Programs" },
  { key: "content", label: "Content" },
  { key: "exams", label: "Exams" },
  { key: "scoring", label: "Scoring review" },
  { key: "redemptions", label: "Redemptions" },
  { key: "billing", label: "Billing" },
  { key: "profiles", label: "Profiles" },
];

const ROLE_CHOICES: { key: Role; label: string }[] = [
  { key: "student", label: "Student" },
  { key: "parent", label: "Parent" },
  { key: "admin", label: "Admin" },
  { key: "super_admin", label: "Super Admin" },
];

const STEPPERS: { key: keyof Rules; label: string; sub: string }[] = [
  { key: "practiceCorrect", label: "Practice correct", sub: "Awarded during practice" },
  { key: "examCorrect", label: "Exam correct", sub: "Awarded for correct exam items" },
  { key: "examWrong", label: "Wrong penalty", sub: "Deducted on wrong exam items" },
  { key: "lessonComplete", label: "Lesson complete", sub: "Awarded on completed lessons" },
];

function ConsolePage() {
  const init = Route.useLoaderData();
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);
  const doCreateUser = useServerFn(createConsoleUser);
  const doUpdateUser = useServerFn(updateConsoleUser);
  const doDeleteUser = useServerFn(deleteConsoleUser);
  const doResetPassword = useServerFn(resetConsoleUserPassword);
  const doAddProgram = useServerFn(addProgram);
  const doUploadProgram = useServerFn(uploadProgramJson);
  const doSetProgramStatus = useServerFn(setProgramStatus);
  const doSetStudentProgram = useServerFn(setStudentProgram);
  const doNewProgramPrompt = useServerFn(newProgramPrompt);
  const doSaveRobux = useServerFn(saveRobuxRules);
  const doSaveReward = useServerFn(saveRewardRule);
  const doApprove = useServerFn(adminApprove);
  const doFulfill = useServerFn(adminFulfill);
  const doCreateRedemption = useServerFn(adminCreateRedemption);
  const doGrantRobux = useServerFn(adminGrantRobux);

  const [snapshot, setSnapshot] = useState(init.snapshot);
  const [tab, setTab] = useState<TabKey>("users");
  const [rules, setRules] = useState(init.rules);
  const [rewards, setRewards] = useState(init.rewards);
  const [redemptions, setRedemptions] = useState(init.redemptions);
  const [savedRules, setSavedRules] = useState(false);
  const [rewardDraft, setRewardDraft] = useState({ prize: "", kind: "complete_in_days" as "complete_in_days" | "streak" | "points", threshold: 45 });

  const primaryProgram = snapshot.programs[0];
  const summary = useMemo(() => ({
    activeUsers: snapshot.users.filter((u) => u.active).length,
    items: snapshot.programs.reduce((sum, p) => sum + p.itemCount, 0),
    pendingRedemptions: redemptions.length,
    scoringNeedsReview: init.scoring.filter((r) => r.status === "manual" || r.status === "pending" || r.status === "scoring").length,
  }), [init.scoring, snapshot.programs, snapshot.users, redemptions.length]);

  function stepRule(key: keyof Rules, delta: number) {
    setRules((current) => ({ ...current, [key]: Math.max(0, current[key] + delta) }));
    setSavedRules(false);
  }

  async function saveRules() {
    if (!primaryProgram) return;
    await doSaveRobux({ data: { programKey: primaryProgram.key, rules } });
    setSavedRules(true);
  }

  async function addReward() {
    if (!rewardDraft.prize.trim() || !primaryProgram) return;
    setRewards(await doSaveReward({ data: { programKey: primaryProgram.key, prize: rewardDraft.prize, kind: rewardDraft.kind, threshold: rewardDraft.threshold, status: "active" } }));
    setRewardDraft({ prize: "", kind: rewardDraft.kind, threshold: rewardDraft.threshold });
  }

  return (
    <AdminParentShell
      user={init.user}
      active="console"
      onLogout={async () => { await doLogout({}); navigate({ to: "/" }); }}
    >
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 26px 60px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 25, margin: 0, fontWeight: 900 }}>Admin console</h1>
            <p style={{ margin: "4px 0 0", color: "var(--a-muted)", fontWeight: 600, fontSize: 14 }}>Operational view for users, programs, content, exams, scoring, rewards, billing, and profiles.</p>
          </div>
          <Link to="/dashboard" style={primaryLink}>Open reports</Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
          <SummaryCard label="Active users" value={summary.activeUsers} />
          <SummaryCard label="Programs" value={snapshot.programs.length} />
          <SummaryCard label="Content items" value={summary.items} />
          <SummaryCard label="Action queue" value={summary.pendingRedemptions + summary.scoringNeedsReview} tone="warn" />
        </div>

        <div className="a-card" style={{ padding: 8, marginBottom: 16, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={tabButton(tab === t.key)}>{t.label}</button>
          ))}
        </div>

        {tab === "users" && (
          <UsersTab
            snapshot={snapshot}
            onCreateUser={async (draft) => {
              const result = await doCreateUser({ data: draft });
              setSnapshot(result.snapshot);
              return result.generatedPassword;
            }}
            onUpdateUser={async (draft) => {
              setSnapshot(await doUpdateUser({ data: draft }));
            }}
            onDeleteUser={async (id) => {
              setSnapshot(await doDeleteUser({ data: { id } }));
            }}
            onResetPassword={async (id) => {
              const result = await doResetPassword({ data: { id } });
              setSnapshot(result.snapshot);
              return result.generatedPassword;
            }}
            onSetStudentProgram={async (studentId, programKey, active) => {
              setSnapshot(await doSetStudentProgram({ data: { studentId, programKey, active } }));
            }}
          />
        )}
        {tab === "programs" && (
          <ProgramsTab
            snapshot={snapshot}
            onAddProgram={async (draft) => {
              const subjects = draft.subjects.split(",").map((s) => s.trim()).filter(Boolean);
              setSnapshot(await doAddProgram({ data: { ...draft, subjects } }));
            }}
            onGenerateProgram={(draft) => doNewProgramPrompt({ data: draft })}
            onUploadProgram={async (json) => {
              const result = await doUploadProgram({ data: { json } });
              setSnapshot(result.snapshot);
              return result.imported;
            }}
            onSetStatus={async (programKey, status) => {
              setSnapshot(await doSetProgramStatus({ data: { programKey, status } }));
            }}
          />
        )}
        {tab === "content" && <ContentTab snapshot={snapshot} />}
        {tab === "exams" && <ExamsTab snapshot={snapshot} />}
        {tab === "scoring" && <ScoringTab rows={init.scoring} />}
        {tab === "redemptions" && (
          <RedemptionsTab
            snapshot={snapshot}
            rules={rules}
            rewards={rewards}
            redemptions={redemptions}
            savedRules={savedRules}
            rewardDraft={rewardDraft}
            onDraft={setRewardDraft}
            onStep={stepRule}
            onSaveRules={saveRules}
            onAddReward={addReward}
            onCreate={async (enrollmentId, item, amount) => setRedemptions(await doCreateRedemption({ data: { enrollmentId, item, amount } }))}
            onGrant={async (enrollmentId, amount) => setRedemptions(await doGrantRobux({ data: { enrollmentId, amount, reason: "admin demo grant" } }))}
            onApprove={async (id) => setRedemptions(await doApprove({ data: { id } }))}
            onFulfill={async (id, amount) => setRedemptions(await doFulfill({ data: { id, amount } }))}
          />
        )}
        {tab === "billing" && <BillingTab billing={init.billing} />}
        {tab === "profiles" && <ProfilesTab />}
      </main>
    </AdminParentShell>
  );
}

function SummaryCard({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "warn" }) {
  return (
    <section className="a-card" style={{ padding: 18 }}>
      <div style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 30, color: tone === "warn" ? "var(--a-warn)" : "var(--a-ink)" }}>{value}</div>
    </section>
  );
}

function UsersTab({
  snapshot,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onResetPassword,
  onSetStudentProgram,
}: {
  snapshot: Snapshot;
  onCreateUser: (draft: UserDraft) => Promise<string>;
  onUpdateUser: (draft: UserUpdateDraft) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onResetPassword: (id: string) => Promise<string>;
  onSetStudentProgram: (studentId: string, programKey: string, active: boolean) => Promise<void>;
}) {
  const students = snapshot.users.filter((u) => u.roles.includes("student"));
  const [draft, setDraft] = useState<UserDraft>({ username: "", displayName: "", roles: ["student"], forceChangeOnFirstLogin: true });
  const [editing, setEditing] = useState<UserUpdateDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function withRole(current: Role[], role: Role, enabled: boolean): Role[] {
    const next = enabled ? [...new Set([...current, role])] : current.filter((item) => item !== role);
    return next.length ? next : current;
  }

  async function create() {
    if (!draft.username.trim() || !draft.displayName.trim()) return;
    setBusy("create");
    try {
      const password = await onCreateUser(draft);
      setDraft({ username: "", displayName: "", roles: ["student"], forceChangeOnFirstLogin: true });
      setMessage(`Created ${draft.displayName}. Temporary password: ${password}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await onUpdateUser(editing);
      setMessage(`Saved ${editing.displayName}.`);
      setEditing(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function updateActive(user: Snapshot["users"][number], active: boolean) {
    setBusy(user.id);
    try {
      await onUpdateUser({ id: user.id, username: user.username, displayName: user.displayName, roles: user.roles, active, forceChangeOnFirstLogin: user.forceChangeOnFirstLogin });
      setMessage(`${user.displayName} is ${active ? "enabled" : "disabled"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function resetPasswordFor(user: Snapshot["users"][number]) {
    setBusy(`reset:${user.id}`);
    try {
      const password = await onResetPassword(user.id);
      setMessage(`Reset ${user.displayName}. Temporary password: ${password}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(user: Snapshot["users"][number]) {
    if (!window.confirm(`Remove ${user.displayName}?`)) return;
    setBusy(`delete:${user.id}`);
    try {
      await onDeleteUser(user.id);
      setMessage(`Removed ${user.displayName}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Add user" note="Create a profile for any role. Password is generated once." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          <input value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} placeholder="Display name" style={inputStyle} />
          <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="Username" style={inputStyle} />
          <label style={checkLabel}>
            <input type="checkbox" checked={draft.forceChangeOnFirstLogin} onChange={(e) => setDraft({ ...draft, forceChangeOnFirstLogin: e.target.checked })} />
            Require password change
          </label>
        </div>
        <RolePicker roles={draft.roles} onChange={(role, enabled) => setDraft({ ...draft, roles: withRole(draft.roles, role, enabled) })} />
        <button onClick={create} disabled={busy === "create" || !draft.username.trim() || !draft.displayName.trim()} style={primaryButton}>{busy === "create" ? "Creating..." : "Add user"}</button>
        {message && <div style={{ marginTop: 12, color: message.includes("Temporary password") || message.startsWith("Saved") || message.startsWith("Created") || message.startsWith("Removed") ? "var(--a-good)" : "var(--a-bad)", fontWeight: 900, fontSize: 13 }}>{message}</div>}
      </section>

      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Users" note={`${snapshot.users.length} platform users`} />
        <div style={{ display: "grid", gap: 10 }}>
          {snapshot.users.map((u) => (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1.1fr) minmax(120px,.8fr) minmax(150px,1fr) auto", gap: 10, padding: 12, border: "1px solid var(--a-border2)", borderRadius: 12, alignItems: "center", fontWeight: 700, fontSize: 13.5 }}>
              <span>
                <span style={{ display: "block", fontWeight: 900 }}>{u.displayName}</span>
                <span style={{ display: "block", color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>@{u.username}</span>
              </span>
              <span style={{ color: "var(--a-muted)" }}>{u.roles.join(", ")}</span>
              <span className="pill" style={{ width: "fit-content", background: u.active ? "var(--a-good-soft)" : "var(--a-bad-soft)", color: u.active ? "var(--a-good)" : "var(--a-bad)" }}>{u.active ? "Active" : "Inactive"}</span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => setEditing({ id: u.id, username: u.username, displayName: u.displayName, roles: u.roles, active: u.active, forceChangeOnFirstLogin: u.forceChangeOnFirstLogin })} style={tinyButton}>Edit</button>
                <button onClick={() => updateActive(u, !u.active)} disabled={busy === u.id} style={tinyButton}>{u.active ? "Disable" : "Enable"}</button>
                <button onClick={() => resetPasswordFor(u)} disabled={busy === `reset:${u.id}`} style={tinyButton}>Reset</button>
                <button onClick={() => remove(u)} disabled={busy === `delete:${u.id}`} style={{ ...tinyButton, color: "var(--a-bad)" }}>Remove</button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Student program access" note="Add or remove a program for a student." />
        {students.length === 0 ? <EmptyNote>No student users found.</EmptyNote> : (
          <div style={{ display: "grid", gap: 14 }}>
            {students.map((student) => (
              <div key={student.id} style={{ border: "1px solid var(--a-border2)", borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>{student.displayName}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {snapshot.programs.map((program) => {
                    const enrollment = student.enrollments.find((e) => e.programKey === program.key);
                    const active = enrollment?.status === "active";
                    return (
                      <button key={program.key} onClick={() => onSetStudentProgram(student.id, program.key, !active)} style={choiceButton(active)}>
                        {active ? "Remove" : "Add"} {program.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <Modal title={`Edit ${editing.displayName}`} onClose={() => setEditing(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} style={inputStyle} />
            <input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} style={inputStyle} />
          </div>
          <RolePicker roles={editing.roles} onChange={(role, enabled) => setEditing({ ...editing, roles: withRole(editing.roles, role, enabled) })} />
          <label style={checkLabel}>
            <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
            Active
          </label>
          <label style={checkLabel}>
            <input type="checkbox" checked={editing.forceChangeOnFirstLogin} onChange={(e) => setEditing({ ...editing, forceChangeOnFirstLogin: e.target.checked })} />
            Require password change
          </label>
          <button onClick={saveEdit} disabled={busy === editing.id || !editing.username.trim() || !editing.displayName.trim()} style={primaryButton}>{busy === editing.id ? "Saving..." : "Save user"}</button>
        </Modal>
      )}
    </div>
  );
}

function RolePicker({ roles, onChange }: { roles: Role[]; onChange: (role: Role, enabled: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "2px 0 12px" }}>
      {ROLE_CHOICES.map((role) => (
        <label key={role.key} style={{ ...checkLabel, margin: 0, background: roles.includes(role.key) ? "var(--a-accent-soft)" : "#fff", borderColor: roles.includes(role.key) ? "var(--a-accent)" : "var(--a-border)" }}>
          <input type="checkbox" checked={roles.includes(role.key)} onChange={(e) => onChange(role.key, e.target.checked)} />
          {role.label}
        </label>
      ))}
    </div>
  );
}

function ProgramsTab({
  snapshot,
  onAddProgram,
  onGenerateProgram,
  onUploadProgram,
  onSetStatus,
}: {
  snapshot: Snapshot;
  onAddProgram: (draft: { title: string; key?: string; category: string; subjects: string; targetDays: number }) => Promise<void>;
  onGenerateProgram: (draft: ProgramPromptDraft) => Promise<string>;
  onUploadProgram: (json: string) => Promise<ProgramUploadResult>;
  onSetStatus: (programKey: string, status: ProgramStatus) => Promise<void>;
}) {
  const [draft, setDraft] = useState({ title: "", key: "", category: "K-12", subjects: "math", targetDays: 45 });
  const [itemsPerSubject, setItemsPerSubject] = useState(30);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  async function add() {
    if (!draft.title.trim() || !draft.subjects.trim()) return;
    setBusy(true);
    try {
      await onAddProgram({ title: draft.title, key: draft.key || undefined, category: draft.category, subjects: draft.subjects, targetDays: draft.targetDays });
      setDraft({ title: "", key: "", category: "K-12", subjects: "math", targetDays: 45 });
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    const subjects = draft.subjects.split(",").map((s) => s.trim()).filter(Boolean);
    if (!draft.title.trim() || subjects.length === 0) return;
    setGenerating(true);
    setCopied(false);
    try {
      setPrompt(await onGenerateProgram({
        programTitle: draft.title.trim(),
        category: draft.category.trim() || undefined,
        subjects,
        targetDays: Math.max(1, draft.targetDays),
        itemsPerSubject: Math.max(1, itemsPerSubject),
      }));
    } finally {
      setGenerating(false);
    }
  }

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setUploadMessage(null);
    try {
      const result = await onUploadProgram(await file.text());
      setUploadMessage(`Uploaded ${result.programTitle}: ${result.bundleCount} bundle(s), ${result.itemCount} item(s).`);
    } catch (e) {
      setUploadMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Add program" note="Creates a new setup-status program with a default exam blueprint." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Program title" style={inputStyle} />
          <input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="Optional key" style={inputStyle} />
          <input value={draft.subjects} onChange={(e) => setDraft({ ...draft, subjects: e.target.value })} placeholder="Subjects, comma separated" style={inputStyle} />
          <input type="number" value={draft.targetDays} onChange={(e) => setDraft({ ...draft, targetDays: Number(e.target.value) })} style={inputStyle} />
          <input type="number" value={itemsPerSubject} onChange={(e) => setItemsPerSubject(Number(e.target.value))} style={inputStyle} title="Items per subject" />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={add} disabled={busy || !draft.title.trim()} style={primaryButton}>{busy ? "Adding..." : "Add program"}</button>
          <button onClick={generate} disabled={generating || !draft.title.trim()} style={secondaryButton}>{generating ? "Generating..." : "Generate program"}</button>
          <label style={{ ...secondaryButton, display: "inline-flex", alignItems: "center" }}>
            Upload program
            <input type="file" accept=".json,application/json" onChange={(e) => upload(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
          </label>
        </div>
        {uploadMessage && <div style={{ marginTop: 10, color: uploadMessage.startsWith("Uploaded") ? "var(--a-good)" : "var(--a-bad)", fontWeight: 900, fontSize: 13 }}>{uploadMessage}</div>}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {snapshot.programs.map((p) => (
          <section key={p.key} className="a-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{p.title}</h2>
              <span className="pill" style={{ background: p.status === "live" ? "var(--a-good-soft)" : "var(--a-warn-soft)", color: p.status === "live" ? "var(--a-good)" : "var(--a-warn)" }}>{p.status}</span>
            </div>
            <p style={{ margin: "0 0 14px", color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>{p.category} · {p.subjects.join(" + ")} · {p.targetDays} day plan</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9, marginBottom: 14 }}>
              <Mini label="Students" value={p.enrolledCount} />
              <Mini label="Bundles" value={p.bundleCount} />
              <Mini label="Items" value={p.itemCount} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onSetStatus(p.key, p.status === "archived" ? "live" : "archived")} style={p.status === "archived" ? primaryButton : secondaryButton}>
                {p.status === "archived" ? "Restore program" : "Remove program"}
              </button>
              {p.status !== "live" && p.status !== "archived" && <button onClick={() => onSetStatus(p.key, "live")} style={secondaryButton}>Set live</button>}
            </div>
          </section>
        ))}
      </div>

      {prompt !== null && (
        <Modal title="Program generation prompt" onClose={() => setPrompt(null)}>
          <textarea readOnly value={prompt} style={{ ...inputStyle, width: "100%", minHeight: 390, resize: "vertical", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }} />
          <button
            onClick={async () => {
              await navigator.clipboard?.writeText(prompt);
              setCopied(true);
            }}
            style={{ ...primaryButton, marginTop: 10 }}
          >
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function ContentTab({ snapshot }: { snapshot: Snapshot }) {
  const loadDetail = useServerFn(bundleDetail);
  const [open, setOpen] = useState<{ title: string; programKey: string; subject: string; bundleId: string } | null>(null);
  const [detail, setDetail] = useState<BundleDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function viewBundle(bundle: { title: string; bundleId: string; programKey: string; subject: string }) {
    setOpen(bundle);
    setDetail(null);
    setLoading(true);
    try {
      setDetail(await loadDetail({ data: { bundleId: bundle.bundleId, programKey: bundle.programKey, subject: bundle.subject } }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="a-card" style={{ padding: 20 }}>
      <SectionTitle title="Content browser" note="Programs stay top-level; bundle item counts open in place." action={<Link to="/admin/content" style={secondaryLink}>Open detailed browser</Link>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {snapshot.programs.map((p) => (
          <div key={p.key} style={{ border: "1px solid var(--a-border2)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>{p.title}</div>
            {p.bundles.length === 0 ? (
              <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 13 }}>No content imported yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {p.bundles.map((b) => (
                  <div key={b.bundleId} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", fontWeight: 700, fontSize: 13 }}>
                    <span>{b.title}</span>
                    <button onClick={() => viewBundle({ bundleId: b.bundleId, programKey: p.key, subject: b.subject, title: b.title })} style={inlineButton}>{b.viewLabel}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          {loading || !detail ? (
            <EmptyNote>Loading items...</EmptyNote>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {detail.pools.slice(0, 10).map((pool) => (
                  <span key={pool.key} className={`pill ${pool.status === "ok" ? "pill-ok" : pool.status === "running_low" ? "pill-low" : "pill-exhausted"}`}>
                    {pool.standardCode} · {pool.unused}/{pool.total}
                  </span>
                ))}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {detail.items.map((item) => (
                  <div key={item._id} style={{ border: "1px solid var(--a-border2)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                      <span className="pill" style={{ background: "var(--a-accent-soft)", color: "var(--a-accent)" }}>{item.standardCodes.join(", ")}</span>
                      <span style={{ color: "var(--a-faint)", fontWeight: 800, fontSize: 11 }}>used {item.usageCount}x</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 13.5 }}>{item.prompt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}

function ExamsTab({ snapshot }: { snapshot: Snapshot }) {
  const [programKey, setProgramKey] = useState(snapshot.programs[0]?.key ?? "");
  const program = snapshot.programs.find((p) => p.key === programKey) ?? snapshot.programs[0];
  const presets = program?.examBlueprint.durationPresets ?? [30, 40, 50, 60, 70, 80, 90, 105];
  const subjects = program?.subjects ?? ["math"];
  const [examName, setExamName] = useState("Weekend STAAR Check");
  const [duration, setDuration] = useState(program?.examBlueprint.defaultDurationMinutes ?? 60);
  const [customDuration, setCustomDuration] = useState(120);
  const [useCustom, setUseCustom] = useState(false);
  const [split, setSplit] = useState(50);
  const [breakMinutes, setBreakMinutes] = useState(Math.round((program?.examBlueprint.breakSeconds ?? 300) / 60));
  const [dateTime, setDateTime] = useState("");
  const [reward, setReward] = useState(100);
  const [totalItems, setTotalItems] = useState(20);
  const [scheduled, setScheduled] = useState<Array<{
    id: string;
    programKey: string;
    programTitle: string;
    examName: string;
    duration: number;
    breakMinutes: number;
    dateTime: string;
    reward: number;
    totalItems: number;
    splitLabel: string;
  }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const actualDuration = useCustom ? customDuration : duration;
  const splitLabel = subjects.length > 1 ? `${subjects[0]} ${split}% / ${subjects[1]} ${100 - split}%` : `${subjects[0] ?? "subject"} 100%`;

  function saveExam() {
    if (!program || !examName.trim()) return;
    const row = {
      id: editingId ?? `${program.key}:${Date.now()}`,
      programKey: program.key,
      programTitle: program.title,
      examName: examName.trim(),
      duration: Math.max(1, actualDuration),
      breakMinutes: Math.max(0, breakMinutes),
      dateTime,
      reward: Math.max(0, reward),
      totalItems: Math.max(1, totalItems),
      splitLabel,
    };
    setScheduled((rows) => (editingId ? rows.map((item) => (item.id === editingId ? row : item)) : [row, ...rows]));
    setEditingId(null);
  }

  function editExam(row: (typeof scheduled)[number]) {
    setEditingId(row.id);
    setProgramKey(row.programKey);
    setExamName(row.examName);
    setUseCustom(!presets.includes(row.duration));
    setDuration(row.duration);
    setCustomDuration(row.duration);
    setBreakMinutes(row.breakMinutes);
    setDateTime(row.dateTime);
    setReward(row.reward);
    setTotalItems(row.totalItems);
  }

  return (
    <section className="a-card" style={{ padding: 20 }}>
      <SectionTitle title="Exam builder" note="Schedule exams by program with timing, breaks, rewards, and editable details." />
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 18 }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
            <select value={program?.key ?? ""} onChange={(e) => setProgramKey(e.target.value)} style={inputStyle}>
              {snapshot.programs.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
            </select>
            <input value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="Exam name" style={inputStyle} />
            <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} style={inputStyle} />
          </div>
          <h3 style={{ fontSize: 14, margin: "6px 0 10px" }}>Duration</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {presets.map((p) => (
              <button key={p} onClick={() => { setUseCustom(false); setDuration(p); }} style={choiceButton(!useCustom && duration === p)}>{p} min</button>
            ))}
            <button onClick={() => setUseCustom(true)} style={choiceButton(useCustom)}>Custom</button>
          </div>
          {useCustom && <input type="number" value={customDuration} min={1} onChange={(e) => setCustomDuration(Number(e.target.value))} style={inputStyle} placeholder="Custom minutes" />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
            <label style={fieldLabel}>Break minutes<input type="number" min={0} value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} style={inputStyle} /></label>
            <label style={fieldLabel}>Robux reward<input type="number" min={0} value={reward} onChange={(e) => setReward(Number(e.target.value))} style={inputStyle} /></label>
            <label style={fieldLabel}>Total items<input type="number" min={1} value={totalItems} onChange={(e) => setTotalItems(Number(e.target.value))} style={inputStyle} /></label>
          </div>
          {subjects.length > 1 && (
            <>
              <h3 style={{ fontSize: 14, margin: "4px 0 10px" }}>Subject split</h3>
              <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} style={{ width: "100%" }} />
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--a-muted)", fontWeight: 800, fontSize: 13 }}>
                <span>{subjects[0]} {split}%</span>
                <span>{subjects[1]} {100 - split}%</span>
              </div>
            </>
          )}
        </div>
        <div style={{ border: "1px solid var(--a-border2)", borderRadius: 12, padding: 16, background: "#FAFBFD" }}>
          <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Live blueprint</h3>
          <BlueprintRow label="Program" value={program?.title ?? "STAAR"} />
          <BlueprintRow label="Exam" value={examName || "Untitled exam"} />
          <BlueprintRow label="Duration" value={`${actualDuration} minutes`} />
          <BlueprintRow label="Break" value={`${breakMinutes} minutes`} />
          <BlueprintRow label="Reward" value={`${reward} Robux`} />
          <BlueprintRow label="Items" value={`${totalItems}`} />
          <BlueprintRow label="Split" value={splitLabel} />
          <button onClick={saveExam} style={{ ...primaryButton, width: "100%", marginTop: 14 }}>{editingId ? "Save exam details" : "Schedule exam"}</button>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <SectionTitle title="Scheduled exams" note={`${scheduled.length} exam${scheduled.length === 1 ? "" : "s"} configured in this demo session.`} />
        {scheduled.length === 0 ? <EmptyNote>No exams scheduled yet.</EmptyNote> : (
          <div style={{ display: "grid", gap: 10 }}>
            {scheduled.map((row) => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) repeat(4,auto)", gap: 10, alignItems: "center", border: "1px solid var(--a-border2)", borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 13 }}>
                <span>
                  <span style={{ display: "block", fontWeight: 900 }}>{row.examName}</span>
                  <span style={{ display: "block", color: "var(--a-muted)", fontSize: 12 }}>{row.programTitle} · {row.dateTime || "date not set"} · {row.splitLabel}</span>
                </span>
                <span>{row.duration} min</span>
                <span>{row.breakMinutes} min break</span>
                <span>{row.reward} Robux</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => editExam(row)} style={tinyButton}>Edit</button>
                  <button onClick={() => setScheduled((rows) => rows.filter((item) => item.id !== row.id))} style={{ ...tinyButton, color: "var(--a-bad)" }}>Cancel</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ScoringTab({ rows }: { rows: ScoringRows }) {
  return (
    <section className="a-card" style={{ padding: 20 }}>
      <SectionTitle title="Scoring review" note="Written responses that need AI or human review." action={<Link to="/scoring" style={secondaryLink}>Open scoring queue</Link>} />
      {rows.length === 0 ? (
        <EmptyNote>No written responses are waiting.</EmptyNote>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.slice(0, 6).map((r) => (
            <div key={r.jobId} style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--a-border2)", borderRadius: 12, padding: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 13.5 }}>{r.studentName}</div>
                <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>{r.programTitle} · {r.itemType.toUpperCase()} · {r.teks || "TEKS"}</div>
              </div>
              <span className="pill" style={{ background: r.status === "manual" ? "var(--a-bad-soft)" : "var(--a-warn-soft)", color: r.status === "manual" ? "var(--a-bad)" : "var(--a-warn)" }}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RedemptionsTab({
  snapshot,
  rules,
  rewards,
  redemptions,
  savedRules,
  rewardDraft,
  onDraft,
  onStep,
  onSaveRules,
  onAddReward,
  onCreate,
  onGrant,
  onApprove,
  onFulfill,
}: {
  snapshot: Snapshot;
  rules: Rules;
  rewards: Rewards;
  redemptions: Redemptions;
  savedRules: boolean;
  rewardDraft: { prize: string; kind: "complete_in_days" | "streak" | "points"; threshold: number };
  onDraft: (draft: { prize: string; kind: "complete_in_days" | "streak" | "points"; threshold: number }) => void;
  onStep: (key: keyof Rules, delta: number) => void;
  onSaveRules: () => Promise<void>;
  onAddReward: () => Promise<void>;
  onCreate: (enrollmentId: string, item: string, amount: number) => Promise<void>;
  onGrant: (enrollmentId: string, amount: number) => Promise<void>;
  onApprove: (id: string) => Promise<void>;
  onFulfill: (id: string, amount: number) => Promise<void>;
}) {
  const enrollments = activeEnrollmentOptions(snapshot);
  const [selected, setSelected] = useState("");
  const [item, setItem] = useState("Roblox: 1,000 Robux");
  const [amount, setAmount] = useState(1000);
  const [grantAmount, setGrantAmount] = useState(1000);
  const enrollmentId = selected || enrollments[0]?.id || "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Create redemption request" note="Use this for demo setup when the student has not earned enough yet." />
        {enrollments.length === 0 ? <EmptyNote>No active enrollments available.</EmptyNote> : (
          <>
            <select value={enrollmentId} onChange={(e) => setSelected(e.target.value)} style={inputStyle}>
              {enrollments.map((e) => <option key={e.id} value={e.id}>{e.studentName} · {e.programTitle}</option>)}
            </select>
            <input value={item} onChange={(e) => setItem(e.target.value)} style={inputStyle} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={inputStyle} />
              <button onClick={() => onCreate(enrollmentId, item, amount)} style={primaryButton}>Create request</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
              <input type="number" value={grantAmount} onChange={(e) => setGrantAmount(Number(e.target.value))} style={inputStyle} />
              <button onClick={() => onGrant(enrollmentId, grantAmount)} style={secondaryButton}>Grant Robux</button>
            </div>
          </>
        )}
      </section>

      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Robux earning rules" note="Per-event earning values." />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {STEPPERS.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 13.5 }}>{s.label}</div>
                <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 11.5 }}>{s.sub}</div>
              </div>
              <button onClick={() => onStep(s.key, -5)} style={stepButton}>-</button>
              <span style={{ fontWeight: 900, fontSize: 17, width: 38, textAlign: "center" }}>{rules[s.key]}</span>
              <button onClick={() => onStep(s.key, 5)} style={stepButton}>+</button>
            </div>
          ))}
        </div>
        <button onClick={onSaveRules} style={{ ...primaryButton, marginTop: 16 }}>{savedRules ? "Saved" : "Save earning rules"}</button>
      </section>

      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Reward rules" note="Big goals and prize milestones." />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {rewards.slice(0, 4).map((r) => (
            <div key={r.id} style={{ border: "1px solid var(--a-border2)", borderRadius: 10, padding: "10px 12px", fontWeight: 800, fontSize: 13 }}>
              {r.prize} <span style={{ color: "var(--a-muted)", fontWeight: 700 }}>· {r.kind.replace(/_/g, " ")} · {r.threshold}</span>
            </div>
          ))}
        </div>
        <input value={rewardDraft.prize} onChange={(e) => onDraft({ ...rewardDraft, prize: e.target.value })} placeholder="Prize, e.g. movie night" style={inputStyle} />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={rewardDraft.kind} onChange={(e) => onDraft({ ...rewardDraft, kind: e.target.value as typeof rewardDraft.kind })} style={{ ...inputStyle, flex: 1 }}>
            <option value="complete_in_days">Complete in days</option>
            <option value="streak">Streak</option>
            <option value="points">Points</option>
          </select>
          <input type="number" value={rewardDraft.threshold} onChange={(e) => onDraft({ ...rewardDraft, threshold: Number(e.target.value) })} style={{ ...inputStyle, width: 90 }} />
        </div>
        <button onClick={onAddReward} style={{ ...secondaryButton, width: "100%" }}>Add reward rule</button>
      </section>

      <section className="a-card" style={{ padding: 20 }}>
        <SectionTitle title="Redemptions to fulfill" note="Approve requests, then fulfill all or part of the balance." />
        {redemptions.length === 0 ? <EmptyNote>No pending redemption requests.</EmptyNote> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {redemptions.map((r) => <RedemptionRow key={r.id} r={r} onApprove={onApprove} onFulfill={onFulfill} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function RedemptionRow({ r, onApprove, onFulfill }: { r: Redemptions[number]; onApprove: (id: string) => Promise<void>; onFulfill: (id: string, amount: number) => Promise<void> }) {
  const remaining = r.amountRequested - r.amountFulfilled;
  const [amount, setAmount] = useState(Math.min(remaining, r.available));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid var(--a-border2)", borderRadius: 12, padding: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>{r.item}</div>
        <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>{r.studentName} · {r.programTitle}</div>
        <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>requested {r.amountRequested} · fulfilled {r.amountFulfilled} · available {r.available}</div>
      </div>
      <span className="pill" style={{ background: r.status === "approved" ? "var(--a-good-soft)" : "var(--a-warn-soft)", color: r.status === "approved" ? "var(--a-good)" : "var(--a-warn)" }}>{r.status}</span>
      {r.status === "requested" && <button onClick={() => onApprove(r.id)} style={secondaryButton}>Approve</button>}
      {r.status === "approved" && (
        <>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ ...inputStyle, width: 84, margin: 0 }} />
          <button onClick={() => onFulfill(r.id, amount)} style={primaryButton}>Fulfill</button>
        </>
      )}
    </div>
  );
}

function BillingTab({ billing }: { billing: Billing }) {
  return (
    <section className="a-card" style={{ padding: 20 }}>
      <SectionTitle title="Plans and billing" note={`Current: ${billing.currentPlanName ? `${billing.currentPlanName} / ${billing.subscriptionStatus}` : "free trial"}`} action={<Link to="/billing" style={secondaryLink}>Open billing</Link>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {billing.plans.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--a-border2)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 900 }}>{p.name}</div>
            <div style={{ fontWeight: 900, fontSize: 24, margin: "4px 0" }}>{p.monthlyLabel}</div>
            <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12 }}>{p.programKeys.length} program(s) · {p.maxStudents} student(s)</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProfilesTab() {
  const doExport = useServerFn(exportProfileFn);
  const doPreview = useServerFn(previewImportFn);
  const doImport = useServerFn(importProfileFn);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  async function exportNow() {
    setBusy(true);
    try {
      const r = await doExport({ data: {} });
      const blob = new Blob([r.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      setExported(`Exported ${r.studentId} at ${r.exportedAt}`);
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
      const result = await doImport({ data: { json, confirm: true } });
      setPreview(result);
      setApplied(result.applied ? `Imported: ${result.decision.reason}` : `Skipped: ${result.decision.reason}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="a-card" style={{ padding: 20 }}>
      <SectionTitle title="Profile import / export" note="Whole-student profile backup and restore, directly in the console." action={<Link to="/admin/profile" style={secondaryLink}>Open full page</Link>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 18 }}>
        <div>
          <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Export</h3>
          <p style={{ color: "var(--a-muted)", fontWeight: 600, fontSize: 13, margin: "0 0 12px" }}>Downloads the selected student's enrollments, attempts, mastery, schedule, wallet, and redemptions.</p>
          <button onClick={exportNow} disabled={busy} style={primaryButton}>{busy ? "Working..." : "Export profile JSON"}</button>
          {exported && <div style={{ color: "var(--a-good)", fontWeight: 800, fontSize: 12.5, marginTop: 10 }}>{exported}</div>}
        </div>
        <div>
          <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Import</h3>
          <textarea value={json} onChange={(e) => { setJson(e.target.value); setPreview(null); setApplied(null); }} placeholder="Paste exported profile JSON here" style={{ ...inputStyle, minHeight: 150, fontFamily: "ui-monospace, Menlo, monospace", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={previewNow} disabled={!json.trim() || busy} style={secondaryButton}>Preview import</button>
            {preview?.ok && preview.decision.action === "apply" && !applied && <button onClick={confirmImport} disabled={busy} style={primaryButton}>Confirm import</button>}
          </div>
          {preview && (
            <div style={{ marginTop: 12, border: "1px solid var(--a-border2)", borderRadius: 10, padding: 12 }}>
              {!preview.ok ? (
                <div style={{ color: "var(--a-bad)", fontWeight: 800, fontSize: 13 }}>Invalid file: {preview.error}</div>
              ) : (
                <>
                  <span className="pill" style={{ background: preview.decision.action === "apply" ? "var(--a-good-soft)" : "var(--a-warn-soft)", color: preview.decision.action === "apply" ? "var(--a-good)" : "var(--a-warn)" }}>
                    {preview.decision.action === "apply" ? "Will replace" : "Will skip"}
                  </span>
                  <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5, margin: "8px 0" }}>{preview.decision.reason}</div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {Object.entries(preview.counts).map(([key, value]) => <span key={key} className="pill" style={{ background: "#F1F4F8", color: "var(--a-muted)" }}>{key}: {value}</span>)}
                  </div>
                  {applied && <div style={{ color: "var(--a-good)", fontWeight: 900, fontSize: 13, marginTop: 10 }}>{applied}</div>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function activeEnrollmentOptions(snapshot: Snapshot) {
  return snapshot.users.flatMap((user) => {
    if (!user.roles.includes("student")) return [];
    return user.enrollments
      .filter((enrollment) => enrollment.status === "active")
      .map((enrollment) => ({
        id: enrollment.id,
        studentName: user.displayName,
        programTitle: snapshot.programs.find((p) => p.key === enrollment.programKey)?.title ?? enrollment.programKey,
      }));
  });
}

function SectionTitle({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
      <div>
        <h2 style={{ fontSize: 17, margin: "0 0 3px" }}>{title}</h2>
        {note && <p style={{ margin: 0, color: "var(--a-muted)", fontWeight: 600, fontSize: 13 }}>{note}</p>}
      </div>
      {action}
    </div>
  );
}

function Mini({ label, value, text = false }: { label: string; value: number | string; text?: boolean }) {
  return (
    <div style={{ background: "#FAFBFD", border: "1px solid var(--a-border2)", borderRadius: 11, padding: 12 }}>
      <div style={{ color: "var(--a-faint)", fontWeight: 800, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: text ? 16 : 22 }}>{value}</div>
    </div>
  );
}

function BlueprintRow({ label, value }: { label: string; value: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, padding: "7px 0", borderBottom: "1px solid var(--a-border2)" }}><span style={{ color: "var(--a-muted)" }}>{label}</span><span>{value}</span></div>;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--a-faint)", fontWeight: 700, fontSize: 13 }}>{children}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(19,26,42,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 20px", zIndex: 80 }}>
      <div onClick={(e) => e.stopPropagation()} className="a-card" style={{ width: "100%", maxWidth: 780, maxHeight: "88vh", overflow: "auto", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ border: "none", background: "var(--a-border2)", width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontWeight: 900 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function tabButton(active: boolean): React.CSSProperties {
  return {
    border: "none",
    cursor: "pointer",
    background: active ? "var(--a-accent)" : "transparent",
    color: active ? "#fff" : "var(--a-muted)",
    fontWeight: 900,
    fontSize: 13,
    padding: "10px 13px",
    borderRadius: 10,
  };
}

function choiceButton(active: boolean): React.CSSProperties {
  return {
    border: "1px solid var(--a-border)",
    cursor: "pointer",
    background: active ? "var(--a-accent)" : "#fff",
    color: active ? "#fff" : "var(--a-muted)",
    fontWeight: 900,
    fontSize: 13,
    padding: "9px 13px",
    borderRadius: 10,
  };
}

const primaryLink: React.CSSProperties = { background: "var(--a-accent)", color: "#fff", fontWeight: 900, fontSize: 13.5, padding: "10px 15px", borderRadius: 10 };
const secondaryLink: React.CSSProperties = { border: "1px solid var(--a-border)", background: "#fff", color: "var(--a-ink)", fontWeight: 900, fontSize: 12.5, padding: "8px 12px", borderRadius: 9 };
const primaryButton: React.CSSProperties = { border: "none", cursor: "pointer", background: "var(--a-accent)", color: "#fff", fontWeight: 900, fontSize: 13, padding: "9px 13px", borderRadius: 9 };
const secondaryButton: React.CSSProperties = { border: "1px solid var(--a-border)", cursor: "pointer", background: "#fff", color: "var(--a-ink)", fontWeight: 900, fontSize: 13, padding: "9px 13px", borderRadius: 9 };
const inlineButton: React.CSSProperties = { border: "none", background: "transparent", color: "var(--a-accent)", cursor: "pointer", fontWeight: 900, fontSize: 13, padding: 0 };
const stepButton: React.CSSProperties = { width: 30, height: 30, border: "1px solid var(--a-border)", background: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 900, fontSize: 16 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--a-border)", borderRadius: 10, fontFamily: "inherit", fontSize: 13.5, outline: "none", marginBottom: 8 };
const tinyButton: React.CSSProperties = { border: "1px solid var(--a-border)", cursor: "pointer", background: "#fff", color: "var(--a-ink)", fontWeight: 900, fontSize: 12, padding: "7px 9px", borderRadius: 8 };
const checkLabel: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--a-border)", borderRadius: 10, padding: "9px 11px", color: "var(--a-muted)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", marginBottom: 8 };
const fieldLabel: React.CSSProperties = { color: "var(--a-muted)", fontWeight: 900, fontSize: 12, display: "grid", gap: 4 };
