import { useState } from "react";
import type { WeatherAudio, WeatherConfig } from "@spudcast/shared";
import { api } from "./api.js";

const DEFAULT_WS4KP = "https://weatherstar.netbymatt.com";

/** Shared editor for a weather channel's embed URL + background audio. */
export function WeatherFields({
  value,
  onChange,
}: {
  value: WeatherConfig;
  onChange: (c: WeatherConfig) => void;
}) {
  const audio: WeatherAudio = value.audio ?? { kind: "none" };
  return (
    <>
      <label className="field">
        WeatherStar (ws4kp) URL
        <input
          className="grow"
          value={value.embedUrl}
          onChange={(e) => onChange({ ...value, embedUrl: e.target.value })}
          placeholder={DEFAULT_WS4KP}
        />
        <span className="muted small">
          Public instance by default. Configure your location inside that page, or self-host ws4kp.
        </span>
      </label>

      <label className="field">
        Background audio
        <select value={audio.kind} onChange={(e) => onChange({ ...value, audio: { kind: e.target.value as WeatherAudio["kind"], value: "" } })}>
          <option value="none">None (silent)</option>
          <option value="youtube">YouTube URL (lofi/jazz)</option>
          <option value="jellyfin">Jellyfin track id</option>
        </select>
      </label>

      {audio.kind !== "none" && (
        <label className="field">
          {audio.kind === "youtube" ? "YouTube URL" : "Jellyfin audio item id"}
          <input
            className="grow"
            value={audio.value ?? ""}
            onChange={(e) => onChange({ ...value, audio: { ...audio, value: e.target.value } })}
            placeholder={audio.kind === "youtube" ? "https://youtu.be/…" : "32-char Jellyfin id"}
          />
        </label>
      )}
    </>
  );
}

/** Create-a-weather-channel wizard. */
export function WeatherChannelWizard({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("Weather");
  const [config, setConfig] = useState<WeatherConfig>({ embedUrl: DEFAULT_WS4KP, audio: { kind: "none" } });
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.createChannel({ number: Number(number), name, type: "weather", config: { weather: config } });
      onCreated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div className="panel">
      <div className="row">
        <button className="ghost" onClick={onCancel}>← Channels</button>
        <h2 style={{ margin: 0 }}>New weather channel</h2>
      </div>
      <p className="muted small">
        An always-live channel: a retro WeatherStar display with your own background music.
      </p>
      <form onSubmit={create} className="stack">
        <div className="row">
          <input placeholder="#" value={number} onChange={(e) => setNumber(e.target.value)} style={{ width: 70 }} required />
          <input placeholder="Channel name" className="grow" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <WeatherFields value={config} onChange={setConfig} />
        <div className="row">
          <button type="submit" disabled={!config.embedUrl}>Create channel</button>
          {msg && <span className="error small">{msg}</span>}
        </div>
      </form>
    </div>
  );
}
