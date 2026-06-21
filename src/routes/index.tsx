import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { auth0Status, startAuth0Login } from "~/server/rpc/session";

export const Route = createFileRoute("/")({
  component: LoginPage,
});

function LoginPage() {
  const beginAuth0 = useServerFn(startAuth0Login);
  const getAuth0Status = useServerFn(auth0Status);
  const [busy, setBusy] = useState(false);
  const [auth0Ready, setAuth0Ready] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAuth0Status({})
      .then((status) => {
        if (mounted) setAuth0Ready(status.enabled);
      })
      .catch(() => {
        if (mounted) setAuth0Ready(false);
      });
    return () => {
      mounted = false;
    };
  }, [getAuth0Status]);

  async function continueWithAuth0() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await beginAuth0({});
      window.location.assign(result.url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setBusy(false);
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

        <div style={{ display: "grid", gap: 12 }}>
          <button disabled={busy || !auth0Ready} onClick={continueWithAuth0} style={loginButton}>
            {busy ? "Opening secure login..." : "Continue with Google"}
          </button>
        </div>

        {!auth0Ready && <div style={{ marginTop: 14, color: "var(--a-bad)", fontWeight: 900, fontSize: 13 }}>Auth0 is not configured for this environment.</div>}
        {message && <div style={{ marginTop: 14, color: "var(--a-bad)", fontWeight: 900, fontSize: 13 }}>{message}</div>}
      </main>
    </div>
  );
}

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
