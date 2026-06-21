import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { finishAuth0Login, selectAuth0Profile } from "~/server/rpc/session";

type ProfileChoice = {
  id: string;
  displayName: string;
  username: string;
  roleLabel: string;
  destination: "/admin/console" | "/student" | "/dashboard";
};

export const Route = createFileRoute("/callback")({
  component: Auth0CallbackPage,
});

function Auth0CallbackPage() {
  const navigate = useNavigate();
  const finishAuth0 = useServerFn(finishAuth0Login);
  const chooseProfile = useServerFn(selectAuth0Profile);
  const ran = useRef(false);
  const [profiles, setProfiles] = useState<ProfileChoice[]>([]);
  const [message, setMessage] = useState("Finishing secure sign in...");
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const providerError = params.get("error_description") || params.get("error");
    const code = params.get("code");
    const state = params.get("state");

    if (providerError) {
      setFailed(true);
      setMessage(providerError);
      return;
    }
    if (!code || !state) {
      setFailed(true);
      setMessage("Auth0 did not return the information needed to sign in.");
      return;
    }

    finishAuth0({ data: { code, state } })
      .then((result) => {
        if (!result.ok) {
          setFailed(true);
          setMessage(result.message);
          return;
        }
        if (result.mode === "select_profile") {
          setMessage("Choose which Comet profile to open.");
          setProfiles(result.profiles);
          return;
        }
        navigate({ to: result.destination });
      })
      .catch((error) => {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, [finishAuth0, navigate]);

  async function selectProfile(profile: ProfileChoice) {
    setBusyProfileId(profile.id);
    setFailed(false);
    setMessage("Opening profile...");
    try {
      const result = await chooseProfile({ data: { userId: profile.id } });
      navigate({ to: result.destination });
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
      setBusyProfileId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F7FB", fontFamily: "'Manrope', sans-serif", color: "var(--a-ink)", display: "grid", placeItems: "center", padding: 20 }}>
      <main className="a-card" style={{ width: "min(560px, 100%)", padding: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--s-primary)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 26px rgba(108,76,224,.22)" }}>
            <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff" }} />
          </div>
          <div>
            <div style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 800, fontSize: 28, lineHeight: 1 }}>Comet Academy</div>
            <div style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 13 }}>Secure login</div>
          </div>
        </div>

        <div style={{ color: failed ? "var(--a-bad)" : "var(--a-muted)", fontWeight: 900, fontSize: 14, marginBottom: profiles.length ? 14 : 0 }}>
          {message}
        </div>

        {profiles.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => selectProfile(profile)}
                disabled={!!busyProfileId}
                style={{
                  border: "1px solid var(--a-border)",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "13px 14px",
                  textAlign: "left",
                  cursor: busyProfileId ? "default" : "pointer",
                  font: "inherit",
                }}
              >
                <div style={{ fontWeight: 900 }}>{profile.displayName}</div>
                <div style={{ color: "var(--a-muted)", fontWeight: 800, fontSize: 12.5 }}>
                  {busyProfileId === profile.id ? "Opening..." : `${profile.roleLabel} · ${profile.username}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {failed && (
          <button onClick={() => navigate({ to: "/" })} style={primaryButton}>
            Back to login
          </button>
        )}
      </main>
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "var(--a-accent)",
  color: "#fff",
  borderRadius: 10,
  padding: "12px 15px",
  font: "inherit",
  fontWeight: 900,
  cursor: "pointer",
  marginTop: 16,
};
