import { Link } from "@tanstack/react-router";
import { NotificationBell } from "./NotificationBell";
import type { Role } from "~/schemas/common";

type UserLike = { displayName: string; roles: Role[] } | null;

type AdminShellProps = {
  user: UserLike;
  active: "console" | "reports" | "history" | "scoring" | "billing" | "content" | "rewards" | "profiles" | "scheduler";
  children: React.ReactNode;
  onLogout: () => void | Promise<void>;
};

function hasStaffRole(user: UserLike): boolean {
  return !!user?.roles.some((r) => r === "admin" || r === "super_admin");
}

function hasParentRole(user: UserLike): boolean {
  return !!user?.roles.includes("parent");
}

export function AdminParentShell({ user, active, children, onLogout }: AdminShellProps) {
  const staff = hasStaffRole(user);
  const parent = hasParentRole(user);
  const roleLabel = staff ? (user?.roles.includes("super_admin") ? "Super Admin" : "Admin") : "Parent";

  const links = staff
    ? [
        { to: "/admin/console", label: "Console", key: "console" },
        { to: "/admin/scheduler", label: "Study Plan", key: "scheduler" },
        { to: "/dashboard", label: "Reports", key: "reports" },
        { to: "/history", label: "History", key: "history" },
        { to: "/scoring", label: "Scoring", key: "scoring" },
        { to: "/billing", label: "Billing", key: "billing" },
        { to: "/admin/profile", label: "Profile I/O", key: "profiles" },
      ]
    : [
        { to: "/dashboard", label: "Dashboard", key: "reports" },
        { to: "/admin/scheduler", label: "Study Plan", key: "scheduler" },
        { to: "/history", label: "History", key: "history" },
        { to: "/billing", label: "Billing", key: "billing" },
        ...(parent ? [{ to: "/scoring", label: "Scoring", key: "scoring" }] : []),
      ];

  return (
    <div className="a-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="brand-lockup">
            <div className="brand-mark brand-mark-admin"><span /></div>
            <span className="brand-word">Comet</span>
            <span className="role-chip">{roleLabel}</span>
          </div>
          <nav className="admin-nav">
            {links.map((l) => {
              const current = active === l.key;
              return (
                <Link key={l.key} to={l.to} className={current ? "admin-nav-link active" : "admin-nav-link"}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="topbar-spacer" />
          <NotificationBell tone="admin" />
          <div className="student-context">
            <div>{user?.displayName ?? "Signed out"}</div>
            <span>{roleLabel} workspace</span>
          </div>
          <button className="topbar-ghost-button" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      {children}
    </div>
  );
}

export function RouteError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  const forbidden = message.toLowerCase().includes("forbidden") || message.toLowerCase().includes("not authenticated");
  return (
    <div className="a-shell">
      <main className="error-panel">
        <div className="brand-mark brand-mark-admin"><span /></div>
        <h1>{forbidden ? "This area is not available for this role" : "We hit a snag"}</h1>
        <p>
          {forbidden
            ? "The page you tried to open is reserved for another role. Use the navigation to return to an available area."
            : "The page did not finish loading. The details below are safe for the team to use while fixing it."}
        </p>
        <pre>{message}</pre>
        <Link to="/" className="error-home-link">Back to role picker</Link>
      </main>
    </div>
  );
}
