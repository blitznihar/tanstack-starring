import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { devProfileLogin, login, loginProfiles } from "~/server/rpc/session";

export const Route = createFileRoute("/")({
  loader: async () => ({ profiles: await loginProfiles() }),
  component: LoginPage,
});

type Profiles = Awaited<ReturnType<typeof loginProfiles>>;
type Profile = Profiles[number];
type RoleFilter = "all" | "student" | "parent" | "admin";

const FILTERS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "student", label: "Students" },
  { key: "parent", label: "Parents" },
  { key: "admin", label: "Staff" },
];

function LoginPage() {
  const { profiles } = Route.useLoaderData();
  const navigate = useNavigate();
  const doProfileLogin = useServerFn(devProfileLogin);
  const doLogin = useServerFn(login);
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const visibleProfiles = useMemo(() => {
    if (filter === "all") return profiles;
    if (filter === "admin") return profiles.filter((profile) => profile.roles.includes("admin") || profile.roles.includes("super_admin"));
    return profiles.filter((profile) => profile.roles.includes(filter));
  }, [filter, profiles]);

  function navigateFor(roles: string[]) {
    if (roles.includes("admin") || roles.includes("super_admin")) navigate({ to: "/admin/console" });
    else if (roles.includes("student")) navigate({ to: "/student" });
    else navigate({ to: "/dashboard" });
  }

  async function pickProfile(profile: Profile) {
    setBusy(profile.id);
    setError(null);
    try {
      const result = await doProfileLogin({ data: { userId: profile.id } });
      navigateFor(result.roles);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setBusy("credentials");
    setError(null);
    try {
      const result = await doLogin({ data: { username, password } });
      if (!result.ok) {
        setError("Username or password did not match.");
        setBusy(null);
        return;
      }
      navigateFor(result.roles);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F5F7FB",
        fontFamily: "'Manrope', sans-serif",
        color: "var(--a-ink)",
      }}
    >
      <main style={{ width: "min(1180px, calc(100% - 36px))", margin: "0 auto", padding: "42px 0 56px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, marginBottom: 26, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 26px rgba(108,76,224,.22)" }}>
              <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff" }} />
            </div>
            <div>
              <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 30, lineHeight: 1 }}>Comet Academy</div>
              <div style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 13 }}>STAAR Practice Platform</div>
            </div>
          </div>
          <form onSubmit={submitCredentials} className="a-card" style={{ padding: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, alignItems: "center", width: "min(100%, 480px)" }}>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" style={loginInput} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete="current-password" style={loginInput} />
            <button disabled={busy === "credentials" || !username.trim() || !password} style={loginButton}>
              {busy === "credentials" ? "Signing in" : "Sign in"}
            </button>
          </form>
        </header>

        <section className="a-card" style={{ padding: 22, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 18 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Choose a profile</h1>
              <p style={{ margin: "4px 0 0", color: "var(--a-muted)", fontWeight: 700, fontSize: 14 }}>
                {profiles.length} active profile{profiles.length === 1 ? "" : "s"} available
              </p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTERS.map((item) => (
                <button key={item.key} onClick={() => setFilter(item.key)} style={filterButton(filter === item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {visibleProfiles.length === 0 ? (
            <div style={{ border: "1px dashed var(--a-border)", borderRadius: 10, padding: 18, color: "var(--a-muted)", fontWeight: 800 }}>
              No profiles match this view.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
              {visibleProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => pickProfile(profile)}
                  disabled={!!busy}
                  style={profileCard(profile, busy === profile.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={avatar(profile)}>{initials(profile.displayName)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 15.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {profile.displayName}
                      </div>
                      <div style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 12 }}>
                        @{profile.username}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="pill" style={rolePill(profile)}>{profile.roleLabel}</span>
                    {profile.roles.length > 1 && <span style={{ color: "var(--a-faint)", fontWeight: 800, fontSize: 11 }}>{profile.roles.length} roles</span>}
                  </div>
                  <div style={{ color: "var(--a-muted)", fontWeight: 700, fontSize: 12.5, marginTop: 11, minHeight: 34, lineHeight: 1.35 }}>
                    {profile.subtitle}
                  </div>
                  <div style={{ marginTop: 14, fontWeight: 900, fontSize: 12.5, color: accent(profile.roles) }}>
                    {busy === profile.id ? "Signing in..." : "Open profile"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {error && <div style={{ color: "var(--a-bad)", fontWeight: 900, fontSize: 13, textAlign: "center" }}>{error}</div>}
      </main>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.replace(/[^a-z0-9]/gi, "")[0]?.toUpperCase() ?? "")
    .join("");
}

function accent(roles: string[]): string {
  if (roles.includes("student")) return "var(--s-primary)";
  if (roles.includes("parent")) return "var(--a-accent)";
  if (roles.includes("super_admin")) return "#1B2233";
  return "#475068";
}

function avatar(profile: Profile): React.CSSProperties {
  const color = accent(profile.roles);
  return {
    width: 48,
    height: 48,
    borderRadius: profile.roles.includes("student") ? "50%" : 12,
    background: color,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 14,
    flex: "none",
  };
}

function rolePill(profile: Profile): React.CSSProperties {
  const color = accent(profile.roles);
  return { background: `${color}18`, color, border: `1px solid ${color}30` };
}

function profileCard(profile: Profile, active: boolean): React.CSSProperties {
  const color = accent(profile.roles);
  return {
    textAlign: "left",
    cursor: active ? "wait" : "pointer",
    border: `1px solid ${active ? color : "var(--a-border2)"}`,
    background: "#fff",
    borderRadius: 10,
    padding: 16,
    boxShadow: active ? `0 0 0 3px ${color}1F` : "0 8px 20px rgba(30,39,60,.06)",
    opacity: active ? 0.88 : 1,
    minHeight: 188,
  };
}

function filterButton(active: boolean): React.CSSProperties {
  return {
    border: active ? "none" : "1px solid var(--a-border)",
    background: active ? "var(--a-accent)" : "#fff",
    color: active ? "#fff" : "var(--a-muted)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12.5,
    padding: "8px 12px",
    borderRadius: 9,
  };
}

const loginInput: React.CSSProperties = {
  border: "1px solid var(--a-border)",
  borderRadius: 9,
  padding: "10px 11px",
  font: "inherit",
  fontWeight: 700,
  minWidth: 0,
};

const loginButton: React.CSSProperties = {
  border: "none",
  background: "var(--a-accent)",
  color: "#fff",
  borderRadius: 9,
  padding: "10px 14px",
  font: "inherit",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
