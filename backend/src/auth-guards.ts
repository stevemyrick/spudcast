import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@spudcast/shared";
import { getSessionUser } from "./session.js";
import { verifyDeviceToken, type Device } from "./services/devices.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by requireAuth/requireAdmin preHandlers. */
    currentUser?: User;
    /** Populated by requireViewer when authenticated via a device token. */
    currentDevice?: Device;
  }
}

/** Extract a device token from header or query (TVs/remotes have no cookie). */
function deviceTokenFrom(req: FastifyRequest): string | null {
  const header = req.headers["x-spud-device"];
  if (typeof header === "string" && header) return header;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const q = (req.query as { token?: string })?.token;
  return q ?? null;
}

/** preHandler: require any authenticated user. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = getSessionUser(req);
  if (!user) {
    return reply.code(401).send({ error: "Authentication required" });
  }
  req.currentUser = user;
}

/** preHandler: require an admin user. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = getSessionUser(req);
  if (!user) {
    return reply.code(401).send({ error: "Authentication required" });
  }
  if (user.role !== "admin") {
    return reply.code(403).send({ error: "Admin access required" });
  }
  req.currentUser = user;
}

/**
 * preHandler for viewer-facing endpoints (now-playing, guide, stream, lineup):
 * accept either a logged-in user OR a valid device token, so the TV works
 * without a login wall.
 */
export async function requireViewer(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = getSessionUser(req);
  if (user) {
    req.currentUser = user;
    return;
  }
  const token = deviceTokenFrom(req);
  const device = token ? verifyDeviceToken(token) : null;
  if (device) {
    req.currentDevice = device;
    return;
  }
  return reply.code(401).send({ error: "Authentication required" });
}
