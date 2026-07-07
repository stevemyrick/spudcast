import { useEffect, useState } from "react";
import type { SettingsView as SettingsDto } from "@spudcast/shared";
import { api } from "./api.js";

/** Common US zones + UTC; the current value is always shown even if not listed. */
const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (EDT/EST)" },
  { value: "America/Chicago", label: "Central (CDT/CST)" },
  { value: "America/Denver", label: "Mountain (MDT/MST)" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { value: "America/Los_Angeles", label: "Pacific (PDT/PST)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "UTC", label: "UTC" },
];

export function SettingsView() {
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [syncTime, setSyncTime] = useState("04:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [msg, setMsg] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const s = await api.getSettings();
    setSettings(s);
    setBaseUrl(s.jellyfinBaseUrl);
    setSyncTime(s.dailySyncTime);
    setTimezone(s.timezone);
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
        timezone,
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
    try {
      const r = await api.testJellyfin();
      setTest(r.ok ? `✓ ${r.detail}` : `✗ ${r.detail}`);
    } catch (e) {
      setTest(`✗ ${e instanceof Error ? e.message : "Connection failed"}`);
    }
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

        <h3>Display</h3>
        <label>
          Timezone <span className="muted small">(schedule &amp; guide times)</span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
            {!TIMEZONES.some((tz) => tz.value === timezone) && (
              <option value={timezone}>{timezone}</option>
            )}
          </select>
        </label>

        <div className="row">
          <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="ghost" onClick={runTest}>Test connection</button>
          {test && <span className="muted small">{test}</span>}
        </div>
        {msg && <p className="muted small">{msg}</p>}
      </form>

      <ParentalSection hasPin={settings.hasStationPin} onChanged={load} />
      <IptvSection />
    </div>
  );
}

/** Set or clear the household PIN that gates locked channels on the TV. */
function ParentalSection({ hasPin, onChanged }: { hasPin: boolean; onChanged: () => Promise<void> }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(clear = false) {
    setBusy(true);
    setMsg(null);
    try {
      await api.setStationPin(clear ? "" : pin);
      setPin("");
      setMsg(clear ? "PIN cleared." : "PIN saved.");
      await onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form" style={{ marginTop: 20 }}>
      <h3>Parental controls</h3>
      <p className="muted small">
        Set a PIN to lock channels. Locked channels are skipped when surfing on the TV and require
        this PIN to tune to directly. {hasPin ? "A PIN is currently set." : "No PIN set."}
      </p>
      <label>
        Station PIN
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder={hasPin ? "•••• (enter to change)" : "e.g. 1234"}
        />
      </label>
      <div className="row">
        <button type="button" onClick={() => save(false)} disabled={busy || pin.length < 3}>Save PIN</button>
        {hasPin && <button type="button" className="ghost danger" onClick={() => save(true)} disabled={busy}>Clear PIN</button>}
        {msg && <span className="muted small">{msg}</span>}
      </div>
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
