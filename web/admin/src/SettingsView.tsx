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

      <IptvSection />
    </div>
  );
}

/** Expose the M3U + XMLTV URLs for playing spudcast channels in Plex/Jellyfin/VLC/TiviMate. */
function IptvSection() {
  const [info, setInfo] = useState<{ playlistUrl: string; xmltvUrl: string } | null>(null);

  async function load() {
    setInfo(await api.iptvInfo());
  }
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function regenerate() {
    if (!confirm("Regenerate the IPTV key? Existing player URLs will stop working.")) return;
    await api.regenerateIptv();
    await load();
  }

  if (!info) return null;
  return (
    <div className="form" style={{ marginTop: 20 }}>
      <h3>IPTV export</h3>
      <p className="muted small">
        Play spudcast channels in Plex/Jellyfin/VLC/TiviMate. The URLs include a private key — keep them on your LAN.
        (External players show the current program; the spudcast TV is the full mid-program experience.)
      </p>
      <label>
        M3U playlist
        <input readOnly value={info.playlistUrl} onFocus={(e) => e.target.select()} />
      </label>
      <label>
        XMLTV guide
        <input readOnly value={info.xmltvUrl} onFocus={(e) => e.target.select()} />
      </label>
      <div className="row">
        <button type="button" className="ghost danger" onClick={regenerate}>Regenerate key</button>
      </div>
    </div>
  );
}
