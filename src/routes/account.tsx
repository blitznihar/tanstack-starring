import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { changeMyPassword, confirmMyEmail, logout, me } from "~/server/rpc/session";

export const Route = createFileRoute("/account")({
  loader: async () => ({ user: await me() }),
  component: AccountPage,
});

function destination(roles: string[]): "/admin/console" | "/student" | "/dashboard" {
  if (roles.includes("admin") || roles.includes("super_admin")) return "/admin/console";
  if (roles.includes("student")) return "/student";
  return "/dashboard";
}

function AccountPage() {
  const { user } = Route.useLoaderData();
  const navigate = useNavigate();
  const doConfirmEmail = useServerFn(confirmMyEmail);
  const doChangePassword = useServerFn(changeMyPassword);
  const doLogout = useServerFn(logout);

  const [email, setEmail] = useState(user?.email ?? "blitznihar@gmail.com");
  const [emailConfirmed, setEmailConfirmed] = useState(!!user?.emailConfirmed);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!user) {
    return (
      <Shell>
        <section className="a-card" style={card}>
          <h1 style={title}>Sign in required</h1>
          <button onClick={() => navigate({ to: "/" })} style={primaryButton}>Go to login</button>
        </section>
      </Shell>
    );
  }

  const needsPassword = user.forceChangeOnFirstLogin;
  const ready = emailConfirmed && !needsPassword;

  async function saveEmail() {
    setBusy("email");
    setMessage(null);
    try {
      const result = await doConfirmEmail({ data: { email } });
      setEmail(result.email);
      setEmailConfirmed(true);
      setMessage("Email confirmed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    setBusy("password");
    setMessage(null);
    try {
      await doChangePassword({ data: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. You can continue.");
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <Shell>
      <section className="a-card" style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={title}>Account setup</h1>
            <p style={subtitle}>Confirm your email and keep your password current.</p>
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={async () => { await doLogout({}); navigate({ to: "/" }); }}
            style={secondaryButton}
          >
            Sign out
          </button>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={panel}>
            <div style={panelTitle}>Email address</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
              <input value={email} onChange={(e) => { setEmail(e.target.value); setEmailConfirmed(false); }} style={inputStyle} />
              <button onClick={saveEmail} disabled={busy === "email" || !email.includes("@")} style={primaryButton}>
                {busy === "email" ? "Saving..." : emailConfirmed ? "Confirmed" : "Confirm"}
              </button>
            </div>
          </div>

          <div style={panel}>
            <div style={panelTitle}>{needsPassword ? "Change starter password" : "Change password"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10 }}>
              <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" placeholder="Current password" style={inputStyle} />
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="New password" style={inputStyle} />
              <button onClick={savePassword} disabled={busy === "password" || !currentPassword || newPassword.length < 8} style={primaryButton}>
                {busy === "password" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {message && <div style={{ marginTop: 14, color: message.includes("changed") || message.includes("confirmed") ? "var(--a-good)" : "var(--a-bad)", fontWeight: 900, fontSize: 13 }}>{message}</div>}

        <button
          onClick={() => navigate({ to: destination(user.roles) })}
          disabled={!ready}
          style={{ ...primaryButton, marginTop: 20, opacity: ready ? 1 : 0.55 }}
        >
          Continue
        </button>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", fontFamily: "'Manrope', sans-serif", color: "var(--a-ink)", display: "grid", placeItems: "center", padding: 20 }}>
      {children}
    </div>
  );
}

const card: React.CSSProperties = {
  width: "min(760px, 100%)",
  padding: 24,
};

const title: React.CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 900,
};

const subtitle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--a-muted)",
  fontWeight: 700,
  fontSize: 13.5,
};

const panel: React.CSSProperties = {
  border: "1px solid var(--a-border2)",
  borderRadius: 12,
  padding: 14,
};

const panelTitle: React.CSSProperties = {
  color: "var(--a-muted)",
  fontWeight: 900,
  fontSize: 12.5,
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--a-border)",
  borderRadius: 10,
  padding: "11px 12px",
  font: "inherit",
  fontWeight: 700,
  minWidth: 0,
};

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "var(--a-accent)",
  color: "#fff",
  borderRadius: 10,
  padding: "11px 15px",
  font: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid var(--a-border)",
  background: "#fff",
  color: "var(--a-muted)",
  borderRadius: 10,
  padding: "9px 13px",
  font: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};
