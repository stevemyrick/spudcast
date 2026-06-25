import { useEffect, useRef, useState } from "react";
import type { ControlServerMessage, RemoteAction } from "@spudcast/shared";
import { controlSocketUrl } from "./api.js";

type State = "enter-code" | "connecting" | "joined" | "error";

/**
 * Phone remote. Enter the code shown on the TV (in its guide) to pair to that
 * TV, then drive it: channel up/down, numeric tune, guide, mute. Talks to the
 * same control socket as the TV.
 */
export function Remote() {
  const [state, setState] = useState<State>("enter-code");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [digits, setDigits] = useState("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => () => wsRef.current?.close(), []);

  function connect(e: React.FormEvent) {
    e.preventDefault();
    setState("connecting");
    setError(null);
    const ws = new WebSocket(controlSocketUrl());
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ role: "remote", code: code.trim().toUpperCase() }));
    ws.onmessage = (ev) => {
      let msg: ControlServerMessage;
      try {
        msg = JSON.parse(ev.data) as ControlServerMessage;
      } catch {
        return;
      }
      if (msg.type === "joined") setState("joined");
      else if (msg.type === "error") {
        setError(msg.message);
        setState("error");
        ws.close();
      }
    };
    ws.onclose = () => setState((s) => (s === "joined" ? "error" : s));
  }

  function send(action: RemoteAction, number?: number) {
    wsRef.current?.send(JSON.stringify({ type: "command", action, number }));
  }

  function pressDigit(d: string) {
    const next = (digits + d).slice(-4);
    setDigits(next);
  }
  function tuneDigits() {
    if (digits) send("set_channel", Number(digits));
    setDigits("");
  }

  if (state !== "joined") {
    return (
      <div className="remote">
        <form className="remote-pair" onSubmit={connect}>
          <h1 className="brand small">spudcast</h1>
          <p className="muted">Enter the code shown on your TV’s guide.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="CODE"
            autoCapitalize="characters"
            style={{ textTransform: "uppercase", letterSpacing: "0.3em" }}
            maxLength={6}
            required
          />
          {error && <p className="err">{error}</p>}
          <button type="submit" disabled={state === "connecting"}>
            {state === "connecting" ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="remote">
      <div className="remote-pad">
        <div className="ch-rocker">
          <button onClick={() => send("channel_up")}>CH ▲</button>
          <span>CH</span>
          <button onClick={() => send("channel_down")}>CH ▼</button>
        </div>

        <div className="num-pad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
            <button key={d} onClick={() => pressDigit(d)}>{d}</button>
          ))}
          <button className="enter" onClick={tuneDigits}>{digits || "—"} ⏎</button>
        </div>

        <div className="remote-actions">
          <button onClick={() => send("toggle_guide")}>Guide</button>
          <button onClick={() => send("toggle_mute")}>Mute</button>
        </div>
      </div>
    </div>
  );
}
