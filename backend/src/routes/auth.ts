import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SessionInfo } from "@spudcast/shared";
import { verifyCredentials } from "../services/users.js";
import { clearSession, getSessionUser, setSession } from "../session.js";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/me", async (req): Promise<SessionInfo> => {
    const user = getSessionUser(req);
    return { authenticated: Boolean(user), user };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid login payload" });
    }
    const user = await verifyCredentials(parsed.data.username, parsed.data.password);
    if (!user) {
      return reply.code(401).send({ error: "Invalid username or password" });
    }
    setSession(reply, user.id);
    return { authenticated: true, user } satisfies SessionInfo;
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { authenticated: false, user: null } satisfies SessionInfo;
  });
}
