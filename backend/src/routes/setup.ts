import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SetupStatus } from "@spudcast/shared";
import { createUser, hasAdmin } from "../services/users.js";
import {
  hasJellyfinConfigured,
  setJellyfinSettings,
} from "../services/settings.js";
import { setSession } from "../session.js";

const setupSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
  jellyfin: z.object({
    baseUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), {
      message: "baseUrl must be http(s)",
    }),
    apiKey: z.string().min(1),
  }),
});

export function setupStatus(): SetupStatus {
  const admin = hasAdmin();
  const jf = hasJellyfinConfigured();
  return { complete: admin && jf, hasAdmin: admin, hasJellyfin: jf };
}

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/setup/status", async () => setupStatus());

  // First-run only: creates the initial admin + stores Jellyfin creds.
  app.post("/api/setup", async (req, reply) => {
    if (hasAdmin()) {
      return reply.code(409).send({ error: "Setup already completed" });
    }
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid setup payload", details: parsed.error.flatten() });
    }
    const { username, password, jellyfin } = parsed.data;
    setJellyfinSettings(jellyfin);
    const admin = await createUser(username, password, "admin");
    setSession(reply, admin.id);
    return reply.code(201).send({ user: admin, status: setupStatus() });
  });
}
