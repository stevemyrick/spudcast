import type { FastifyInstance, FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import type { ControlClientMessage } from "@spudcast/shared";
import { verifyDeviceToken } from "../services/devices.js";
import { dropSocket, joinRoom, openRoom, relayCommand, type Socket } from "../services/control.js";

/** Explicit extra origins allowed to open the control socket (comma-separated). */
const ORIGIN_ALLOWLIST = (process.env.SPUDCAST_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Guard the remote-control socket against cross-site hijacking (CSWSH). This is a
 * LAN app, so we accept requests with no Origin (native clients) and browser
 * Origins on localhost / private-LAN hosts, plus any explicit allowlist entry.
 * A page on the public internet gets a public Origin and is rejected.
 */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser client (no Origin header)
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (ORIGIN_ALLOWLIST.includes(origin.toLowerCase())) return true;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  // Private IPv4 ranges: 10/8, 192.168/16, 172.16–31/12.
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

export async function controlRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get("/api/control", { websocket: true }, (socket, req: FastifyRequest) => {
    const sock = socket as unknown as Socket & {
      on(ev: string, cb: (data?: unknown) => void): void;
      close(): void;
    };

    if (!isAllowedOrigin(req.headers.origin)) {
      sock.send(JSON.stringify({ type: "error", message: "Origin not allowed" }));
      sock.close();
      return;
    }
    let role: "tv" | "remote" | null = null;
    let code: string | null = null;

    sock.on("message", (raw?: unknown) => {
      let msg: ControlClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ControlClientMessage;
      } catch {
        return;
      }

      // First message establishes the role.
      if (!role) {
        if ("role" in msg && msg.role === "tv") {
          if (!verifyDeviceToken(msg.token)) {
            sock.send(JSON.stringify({ type: "error", message: "Invalid device token" }));
            return;
          }
          role = "tv";
          code = openRoom(sock);
        } else if ("role" in msg && msg.role === "remote") {
          if (joinRoom(msg.code, sock)) {
            role = "remote";
            code = msg.code.toUpperCase();
          }
        }
        return;
      }

      // Established remotes may send commands; TVs only receive.
      if (role === "remote" && code && "type" in msg && msg.type === "command") {
        relayCommand(code, msg);
      }
    });

    sock.on("close", () => dropSocket(sock));
  });
}
