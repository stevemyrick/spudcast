import type { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@spudcast/shared";
import { getSessionUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by requireAuth/requireAdmin preHandlers. */
    currentUser?: User;
  }
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
