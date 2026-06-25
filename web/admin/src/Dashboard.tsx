import { useState } from "react";
import type { SessionInfo } from "@spudcast/shared";
import { api } from "./api.js";
import { LibraryView } from "./LibraryView.js";
import { SettingsView } from "./SettingsView.js";
import { DevicesView } from "./DevicesView.js";
import { UsersView } from "./UsersView.js";

type Tab = "library" | "devices" | "users" | "settings";

/** Home shell once setup + login are complete. Channel building lands in M3. */
export function Dashboard({ session, onLogout }: { session: SessionInfo; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("library");
  const isAdmin = session.user?.role === "admin";

  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo small">spudcast</span>
        <nav className="tabs">
          <button className={tab === "library" ? "tab active" : "tab"} onClick={() => setTab("library")}>Library</button>
          {isAdmin && (
            <button className={tab === "devices" ? "tab active" : "tab"} onClick={() => setTab("devices")}>Devices</button>
          )}
          {isAdmin && (
            <button className={tab === "users" ? "tab active" : "tab"} onClick={() => setTab("users")}>Users</button>
          )}
          {isAdmin && (
            <button className={tab === "settings" ? "tab active" : "tab"} onClick={() => setTab("settings")}>Settings</button>
          )}
        </nav>
        <span className="spacer" />
        <span className="muted small">{session.user?.username} ({session.user?.role})</span>
        <button className="ghost" onClick={logout}>Sign out</button>
      </header>
      <main className="content">
        {tab === "library" && <LibraryView />}
        {tab === "devices" && isAdmin && <DevicesView />}
        {tab === "users" && isAdmin && <UsersView session={session} />}
        {tab === "settings" && isAdmin && <SettingsView />}
      </main>
    </div>
  );
}
