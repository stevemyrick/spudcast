import { useEffect, useState } from "react";
import { api } from "./api.js";

type Device = { id: number; name: string; kind: string; lastSeen: string | null };

/** Pair a TV by entering the code shown on its screen, and manage paired devices. */
export function DevicesView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("Living Room TV");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setDevices(await api.listDevices());
  }
  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function claim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const d = await api.claimDevice(code.trim().toUpperCase(), name.trim() || "TV");
      setMsg(`Paired “${d.name}”. The TV should start playing momentarily.`);
      setCode("");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: number) {
    await api.revokeDevice(id);
    await load();
  }

  return (
    <div className="panel">
      <h2>Devices</h2>
      <p className="muted small">
        Open <code>/tv</code> on your kiosk device, then enter the code it shows here.
      </p>
      <form className="row" onSubmit={claim}>
        <input
          placeholder="CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ textTransform: "uppercase", letterSpacing: "0.2em", width: 130 }}
          maxLength={8}
          required
        />
        <input placeholder="Device name" value={name} onChange={(e) => setName(e.target.value)} className="grow" />
        <button type="submit" disabled={busy}>{busy ? "Pairing…" : "Pair"}</button>
      </form>
      {msg && <p className="muted small">{msg}</p>}

      <div className="list">
        {devices.map((d) => (
          <div className="list-item" key={d.id}>
            <span className="badge">{d.kind}</span>
            <span className="title">{d.name}</span>
            <span className="spacer" />
            <span className="muted small">
              {d.lastSeen ? `seen ${new Date(d.lastSeen).toLocaleString()}` : "never"}
            </span>
            <button className="ghost" onClick={() => revoke(d.id)}>Revoke</button>
          </div>
        ))}
        {devices.length === 0 && <p className="muted">No devices paired yet.</p>}
      </div>
    </div>
  );
}
