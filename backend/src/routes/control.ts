import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { ControlClientMessage } from "@spudcast/shared";
import { verifyDeviceToken } from "../services/devices.js";
import { dropSocket, joinRoom, openRoom, relayCommand, type Socket } from "../services/control.js";

export async function controlRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get("/api/control", { websocket: true }, (socket) => {
    const sock = socket as unknown as Socket & {
      on(ev: string, cb: (data?: unknown) => void): void;
    };
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
