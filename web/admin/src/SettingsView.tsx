import { useEffect, useState } from "react";
import type { SettingsView as SettingsDto } from "@spudcast/shared";
import { api } from "./api.js";

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [syncTime, setSyncTime] = useState("04:00");
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const s = await api.getSettings();
    setSettings(s);
    setBaseUrl(s.jellyfinBaseUrl);
    setSyncTime(s.dailySyncTime);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.updateSettings({
        jellyfinBaseUrl: baseUrl,
        jellyfinApiKey: apiKey || undefined, // blank = leave unchanged
        dailySyncTime: syncTime,
      });
      setApiKey("");
      setMsg("Saved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    setTest("Testing…");
    const r = await api.testJellyfin();
    setTest(r.ok ? `✓ ${r.detail}` : `✗ ${r.detail}`);
  }

  if (!settings) return <div className="panel"><p className="muted">Loading…</p></div>;

  return (
    <div className="panel">
      <h2>Settings</h2>
      <form className="form" onSubmit={save}>
        <h3>Jellyfin</h3>
        <label>
          Server URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://192.168.1.10:8096" />
        </label>
        <label>
          API key {settings.hasJellyfinKey && <span className="muted small">(set — leave blank to keep)</span>}
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.hasJellyfinKey ? "••••••••" : "API key"} />
        </label>

        <h3>Sync</h3>
        <label>
          Daily sync time
          <input type="time" value={syncTime} onChange={(e) => setSyncTime(e.target.value)} />
        </label>

        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="ghost" onClick={runTest}>Test connection</button>
          {test && <span className="muted small">{test}</span>}
        </div>
        {msg && <p className="muted small">{msg}</p>}
      </form>
    </div>
  );
}
