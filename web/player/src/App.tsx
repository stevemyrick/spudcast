import { useState } from "react";
import { getToken } from "./api.js";
import { Pairing } from "./Pairing.js";
import { Player } from "./Player.js";
import { Remote } from "./Remote.js";

/**
 * Two roles share this bundle:
 *  - /tv/remote  -> the phone remote
 *  - /tv/ (else) -> the TV: pairing screen until paired, then the player.
 */
export function App() {
  const isRemote = location.pathname.replace(/\/+$/, "").endsWith("/remote");
  const [paired, setPaired] = useState(() => Boolean(getToken()));

  if (isRemote) return <Remote />;
  if (!paired) return <Pairing onPaired={() => setPaired(true)} />;
  return <Player />;
}
