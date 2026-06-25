import { useState } from "react";
import { getToken } from "./api.js";
import { Pairing } from "./Pairing.js";
import { Player } from "./Player.js";

/**
 * The TV. If this device isn't paired yet, show the pairing code; once paired,
 * become the full-screen player. The channel state machine, overlays, static
 * transition and failover slate all live in <Player>.
 */
export function App() {
  const [paired, setPaired] = useState(() => Boolean(getToken()));
  if (!paired) return <Pairing onPaired={() => setPaired(true)} />;
  return <Player />;
}
