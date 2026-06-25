import { useEffect, useState } from "react";
import type { HealthResponse } from "@spudcast/shared";

/**
 * M0 placeholder TV screen. The channel state machine, video playback, overlays
 * and device pairing land in M2.
 */
export function App() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((h) => setOnline(h.status === "ok"))
      .catch(() => setOnline(false));
  }, []);

  return (
    <div className="tv">
      <div className="static" aria-hidden />
      <div className="screen">
        <h1 className="brand">spudcast</h1>
        <p className="status">
          {online === null ? "Tuning…" : online ? "Please stand by" : "No signal"}
        </p>
      </div>
    </div>
  );
}
