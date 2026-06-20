import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { forgotPassword, login } from "~/server/rpc/session";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function destination(roles: string[]): "/admin/console" | "/student" | "/dashboard" {
  if (roles.includes("admin") || roles.includes("super_admin")) return "/admin/console";
  if (roles.includes("student")) return "/student";
  return "/dashboard";
}

function LoginPage() {
  const navigate = useNavigate();
  const doLogin = useServerFn(login);
  const doForgot = useServerFn(forgotPassword);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setBusy("login");
    setMessage(null);
    try {
      const result = await doLogin({ data: { username, password } });
      if (!result.ok) {
        setMessage("Username or password did not match.");
        setBusy(null);
        return;
      }
      navigate({ to: result.needsAccountSetup ? "/account" : destination(result.roles) });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function submitForgot(event: React.FormEvent) {
    event.preventDefault();
    if (!forgot.trim()) return;
    setBusy("forgot");
    setMessage(null);
    try {
      await doForgot({ data: { usernameOrEmail: forgot } });
      setMessage("If that account exists, the password was reset and an email notification was queued.");
      setForgot("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", fontFamily: "'Manrope', sans-serif", color: "var(--a-ink)", display: "grid", placeItems: "center", padding: 20 }}>
      <main className="a-card" style={{ width: "min(520px, 100%)", padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 26px rgba(108,76,224,.22)" }}>
            <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff" }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1 }}>Comet Academy</div>
            <div style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 13 }}>STAAR Practice Platform</div>
          </div>
        </div>

        <form onSubmit={submitCredentials} style={{ display: "grid", gap: 10 }}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" style={loginInput} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" style={loginInput} />
          <button disabled={busy === "login" || !username.trim() || !password} style={loginButton}>
            {busy === "login" ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <form onSubmit={submitForgot} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 18 }}>
          <input value={forgot} onChange={(e) => setForgot(e.target.value)} placeholder="Username or email" style={loginInput} />
          <button disabled={busy === "forgot" || !forgot.trim()} style={secondaryButton}>
            {busy === "forgot" ? "Resetting..." : "Forgot password"}
          </button>
        </form>

        {message && <div style={{ marginTop: 14, color: message.includes("reset") || message.includes("queued") ? "var(--a-good)" : "var(--a-bad)", fontWeight: 900, fontSize: 13 }}>{message}</div>}
      </main>
    </div>
  );
}

const loginInput: React.CSSProperties = {
  border: "1px solid var(--a-border)",
  borderRadius: 10,
  padding: "12px 13px",
  font: "inherit",
  fontWeight: 700,
  minWidth: 0,
};

const loginButton: React.CSSProperties = {
  border: "none",
  background: "var(--a-accent)",
  color: "#fff",
  borderRadius: 10,
  padding: "12px 15px",
  font: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid var(--a-border)",
  background: "#fff",
  color: "var(--a-accent)",
  borderRadius: 10,
  padding: "12px 13px",
  font: "inherit",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
