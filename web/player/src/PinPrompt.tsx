import { useCallback, useEffect, useState } from "react";

/**
 * Full-screen PIN gate shown when tuning to a locked channel. Accepts digits
 * from a keyboard (or the phone remote's keypad, handled by the parent). Enter
 * submits, Esc cancels.
 */
export function PinPrompt({
  channelName,
  onVerify,
  onCancel,
}: {
  channelName: string;
  onVerify: (pin: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState(false);

  const submit = useCallback(
    async (pin: string) => {
      if (!pin) return;
      const ok = await onVerify(pin);
      if (!ok) {
        setError(true);
        setEntry("");
      }
    },
    [onVerify],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) {
        setError(false);
        setEntry((p) => (p + e.key).slice(0, 8));
      } else if (e.key === "Enter") {
        setEntry((p) => { void submit(p); return p; });
      } else if (e.key === "Escape") {
        onCancel();
      } else if (e.key === "Backspace") {
        setEntry((p) => p.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, onCancel]);

  return (
    <div className="pin-gate">
      <div className="pin-lock">🔒</div>
      <p className="status">Locked · {channelName}</p>
      <div className="pin-dots">{entry ? "•".repeat(entry.length) : "enter PIN"}</div>
      {error && <p className="hint pin-err">Incorrect PIN</p>}
      <p className="hint">Enter the station PIN on the remote keypad or keyboard</p>
    </div>
  );
}
