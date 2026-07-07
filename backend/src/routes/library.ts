import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LibraryPage, LibrarySyncResult, SyncStatus } from "@spudcast/shared";
import { requireAdmin, requireAuth } from "../auth-guards.js";
import { distinctGenres, distinctRatings, list, queryByRules } from "../services/library.js";
import { getSyncStatus, syncLibrary } from "../services/sync.js";

const querySchema = z.object({
  type: z.enum(["movie", "episode", "commercial", "bumper", "music_video"]).optional(),
  genre: z.string().max(64).optional(),
  search: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/library",
    { preHandler: requireAuth },
    async (req, reply): Promise<LibraryPage | void> => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query" });
      }
      return list(parsed.data);
    },
  );

  app.get(
    "/api/library/sync-status",
    { preHandler: requireAuth },
    async (): Promise<SyncStatus> => getSyncStatus(),
  );

  // Distinct genres for the auto-channel wizard.
  app.get("/api/library/genres", { preHandler: requireAuth }, async (): Promise<string[]> =>
    distinctGenres(),
  );

  // Distinct content ratings for the parental filter in the auto-channel wizard.
  app.get("/api/library/ratings", { preHandler: requireAuth }, async (): Promise<string[]> =>
    distinctRatings(),
  );

  // Preview how many programs an auto-channel rule set would match.
  app.post("/api/library/preview", { preHandler: requireAuth }, async (req) => {
    const rules = (req.body ?? {}) as Record<string, unknown>;
    const items = queryByRules(rules);
    return { count: items.length, sample: items.slice(0, 8).map((i) => i.title) };
  });

  app.post(
    "/api/library/refresh",
    { preHandler: requireAdmin },
    async (req, reply): Promise<LibrarySyncResult | void> => {
      const full = (req.query as { full?: string })?.full === "true";
      try {
        return await syncLibrary({ full });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sync failed";
        const code = msg.includes("in progress") ? 409 : 502;
        return reply.code(code).send({ error: msg });
      }
    },
  );
}
