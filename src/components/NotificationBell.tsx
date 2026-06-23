import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { markAllNotificationsRead, markNotificationRead, myNotifications } from "~/server/rpc/notifications";

type NotificationSnapshot = Awaited<ReturnType<typeof myNotifications>>;
type NotificationItem = NotificationSnapshot["items"][number];

export function NotificationBell({ tone = "admin" }: { tone?: "admin" | "student" }) {
  const loadNotifications = useServerFn(myNotifications);
  const markAllRead = useServerFn(markAllNotificationsRead);
  const markRead = useServerFn(markNotificationRead);
  const [snapshot, setSnapshot] = useState<NotificationSnapshot>({ unreadCount: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    try {
      setSnapshot(await loadNotifications({}));
    } catch {
      setSnapshot({ unreadCount: 0, items: [] });
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      try {
        const next = await loadNotifications({});
        if (active) setSnapshot(next);
      } catch {
        if (active) setSnapshot({ unreadCount: 0, items: [] });
      }
    }
    initialLoad();
    const timer = window.setInterval(initialLoad, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  async function readAll() {
    if (busy) return;
    setBusy(true);
    try {
      await markAllRead({});
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function readOne(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await markRead({ data: { id } });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const unread = snapshot.unreadCount;

  return (
    <div ref={rootRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        title="Notifications"
        onClick={() => setOpen((value) => !value)}
        style={bellButton(tone, open)}
      >
        <BellIcon />
        {unread > 0 && <span style={badgeStyle(tone)}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div style={panelStyle(tone)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {snapshot.items.length > 0 && (
              <button type="button" onClick={readAll} disabled={busy || unread === 0} style={panelAction(tone, unread > 0)}>
                Mark all read
              </button>
            )}
          </div>
          {snapshot.items.length === 0 ? (
            <div style={{ color: mutedColor(tone), fontWeight: 800, fontSize: 13, padding: "16px 2px" }}>No notifications yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 9, maxHeight: 360, overflow: "auto", paddingRight: 2 }}>
              {snapshot.items.map((item) => (
                <NotificationRow key={item.id} item={item} tone={tone} busy={busy} onRead={readOne} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationRow({ item, tone, busy, onRead }: { item: NotificationItem; tone: "admin" | "student"; busy: boolean; onRead: (id: string) => void }) {
  const unread = !item.readAt;
  return (
    <article style={rowStyle(tone, unread)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ color: accentColor(tone), fontWeight: 900, fontSize: 11.5 }}>{item.label}</span>
        <span style={{ color: mutedColor(tone), fontWeight: 800, fontSize: 11 }}>{formatWhen(item.createdAt)}</span>
      </div>
      <div style={{ color: inkColor(tone), fontWeight: 900, fontSize: 13.5, marginTop: 5 }}>{item.subject}</div>
      <p style={{ color: mutedColor(tone), fontWeight: 700, fontSize: 12.5, lineHeight: 1.35, margin: "4px 0 0" }}>{item.preview}</p>
      {unread && (
        <button type="button" disabled={busy} onClick={() => onRead(item.id)} style={readButton(tone)}>
          Mark read
        </button>
      )}
    </article>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function inkColor(tone: "admin" | "student") {
  return tone === "student" ? "var(--s-ink)" : "var(--a-ink)";
}

function mutedColor(tone: "admin" | "student") {
  return tone === "student" ? "var(--s-muted)" : "var(--a-muted)";
}

function accentColor(tone: "admin" | "student") {
  return tone === "student" ? "var(--s-primary-ink)" : "var(--a-accent)";
}

function bellButton(tone: "admin" | "student", active: boolean): React.CSSProperties {
  return {
    width: 38,
    height: 38,
    borderRadius: tone === "student" ? 12 : 10,
    border: tone === "student" ? "1px solid #EFE7DA" : "1px solid var(--a-border)",
    background: active ? (tone === "student" ? "var(--s-primary-soft)" : "var(--a-accent-soft)") : "#fff",
    color: active ? accentColor(tone) : mutedColor(tone),
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    position: "relative",
    boxShadow: tone === "student" ? "0 8px 18px rgba(54,48,74,.06)" : "none",
  };
}

function badgeStyle(tone: "admin" | "student"): React.CSSProperties {
  return {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    background: tone === "student" ? "var(--s-accent)" : "var(--a-bad)",
    color: "#fff",
    border: "2px solid #fff",
    display: "grid",
    placeItems: "center",
    fontWeight: 900,
    fontSize: 10,
    lineHeight: 1,
    padding: "0 4px",
  };
}

function panelStyle(tone: "admin" | "student"): React.CSSProperties {
  return {
    position: "absolute",
    top: 46,
    right: 0,
    zIndex: 80,
    width: "min(360px, calc(100vw - 32px))",
    background: "#fff",
    color: inkColor(tone),
    border: tone === "student" ? "1px solid #EFE7DA" : "1px solid var(--a-border)",
    borderRadius: tone === "student" ? 16 : 12,
    boxShadow: "0 22px 60px rgba(19,26,42,.18)",
    padding: 14,
  };
}

function rowStyle(tone: "admin" | "student", unread: boolean): React.CSSProperties {
  return {
    border: tone === "student" ? "1px solid #EFE7DA" : "1px solid var(--a-border2)",
    background: unread ? (tone === "student" ? "#FFF8EF" : "#FAFBFD") : "#fff",
    borderRadius: tone === "student" ? 13 : 10,
    padding: 12,
  };
}

function panelAction(tone: "admin" | "student", enabled: boolean): React.CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: enabled ? accentColor(tone) : mutedColor(tone),
    cursor: enabled ? "pointer" : "default",
    fontWeight: 900,
    fontSize: 12,
    padding: 0,
  };
}

function readButton(tone: "admin" | "student"): React.CSSProperties {
  return {
    marginTop: 9,
    border: "none",
    background: tone === "student" ? "var(--s-primary-soft)" : "var(--a-accent-soft)",
    color: accentColor(tone),
    borderRadius: 8,
    padding: "6px 9px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 11.5,
  };
}
