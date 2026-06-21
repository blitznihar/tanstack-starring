import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { logout } from "~/server/rpc/session";

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const navigate = useNavigate();
  const doLogout = useServerFn(logout);

  useEffect(() => {
    doLogout({})
      .catch(() => undefined)
      .finally(() => navigate({ to: "/" }));
  }, [doLogout, navigate]);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", fontFamily: "'Manrope', sans-serif", color: "var(--a-ink)", display: "grid", placeItems: "center", padding: 20 }}>
      <main className="a-card" style={{ width: "min(420px, 100%)", padding: 24, fontWeight: 900 }}>
        Signing out...
      </main>
    </div>
  );
}
