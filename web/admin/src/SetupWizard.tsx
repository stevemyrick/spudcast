import { useState } from "react";
import { api } from "./api.js";

/** First-run wizard: create the initial admin and connect Jellyfin. */
export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.completeSetup({ username, password, jellyfin: { baseUrl, apiKey } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1 className="logo">spudcast</h1>
        <p className="muted">Welcome. Let's set up your retro TV station.</p>

        <h2>Admin account</h2>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
        </label>

        <h2>Connect Jellyfin</h2>
        <label>
          Server URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://192.168.1.10:8096" required />
        </label>
        <label>
          API key
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Jellyfin API key" required />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Setting up…" : "Create station"}</button>
      </form>
    </div>
  );
}
