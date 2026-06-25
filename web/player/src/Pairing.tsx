import { useEffect, useRef, useState } from "react";
import { playerApi, setToken } from "./api.js";

/** Shows a pairing code and polls until an admin claims it, then stores the token. */
export function Pairing({ onPaired }: { onPaired: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // guard React StrictMode double-run
    startedRef.current = true;

    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    playerApi
      .startPairing()
      .then(({ pairingId, code }) => {
        if (cancelled) return;
        setCode(code);
        timer = setInterval(async () => {
          try {
            const res = await playerApi.pollPairing(pairingId);
            if (res.status === "paired") {
              clearInterval(timer);
              setToken(res.token);
              onPaired();
            }
          } catch {
            /* keep polling */
          }
        }, 2500);
      })
      .catch(() => setError("Couldn't reach spudcast. Retrying…"));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [onPaired]);

  return (
    <div className="tv">
      <div className="static" aria-hidden />
      <div className="screen">
        <h1 className="brand">spudcast</h1>
        <p className="status">Pair this TV</p>
        <div className="code">{code ?? "······"}</div>
        <p className="hint">
          In the spudcast admin, open <b>Devices</b> and enter this code.
        </p>
        {error && <p className="hint">{error}</p>}
      </div>
    </div>
  );
}
