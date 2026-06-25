import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { User } from "@spudcast/shared";
import { requireAdmin } from "../auth-guards.js";
import { createUser, deleteUser, listUsers, usernameExists } from "../services/users.js";

const createSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(256),
  role: z.enum(["admin", "user"]).default("user"),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/users", { preHandler: requireAdmin }, async (): Promise<User[]> => listUsers());

  app.post("/api/users", { preHandler: requireAdmin }, async (req, reply): Promise<User | void> => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid user" });
    if (usernameExists(parsed.data.username)) {
      return reply.code(409).send({ error: "Username already taken" });
    }
    return createUser(parsed.data.username, parsed.data.password, parsed.data.role);
  });

  app.delete("/api/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (id === req.currentUser!.id) {
      return reply.code(400).send({ error: "You can't delete your own account" });
    }
    try {
      deleteUser(id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Delete failed" });
    }
  });
}
