import { useEffect, useState } from "react";
import type { SessionInfo, SetupStatus } from "@spudcast/shared";
import { api } from "./api.js";
import { SetupWizard } from "./SetupWizard.js";
import { Login } from "./Login.js";
import { Dashboard } from "./Dashboard.js";

type Phase =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "login" }
  | { kind: "ready"; session: SessionInfo };

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  async function refresh() {
    const status: SetupStatus = await api.getSetupStatus();
    if (!status.complete) {
      setPhase({ kind: "setup" });
      return;
    }
    const session = await api.me();
    setPhase(session.authenticated ? { kind: "ready", session } : { kind: "login" });
  }

  useEffect(() => {
    refresh().catch(() => setPhase({ kind: "login" }));
  }, []);

  if (phase.kind === "loading") {
    return <div className="center muted">Loading spudcast…</div>;
  }
  if (phase.kind === "setup") {
    return <SetupWizard onDone={refresh} />;
  }
  if (phase.kind === "login") {
    return <Login onDone={refresh} />;
  }
  return <Dashboard session={phase.session} onLogout={refresh} />;
}
