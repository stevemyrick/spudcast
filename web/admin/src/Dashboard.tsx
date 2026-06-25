import type { SessionInfo } from "@spudcast/shared";
import { api } from "./api.js";

/** Placeholder home once setup + login are complete. Channels UI lands in M3. */
export function Dashboard({ session, onLogout }: { session: SessionInfo; onLogout: () => void }) {
  async function logout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="logo small">spudcast</span>
        <span className="spacer" />
        <span className="muted">{session.user?.username} ({session.user?.role})</span>
        <button className="ghost" onClick={logout}>Sign out</button>
      </header>
      <main className="center">
        <div className="card">
          <h2>Station ready 📺</h2>
          <p className="muted">
            Setup complete. Channel creation, the library browser, and auto-generated
            channels arrive in the next milestones.
          </p>
          <p className="muted">
            Open the TV at <code>/tv</code> on your kiosk device.
          </p>
        </div>
      </main>
    </div>
  );
}
