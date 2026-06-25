import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConnectionTestResult, SettingsView } from "@spudcast/shared";
import { requireAdmin } from "../auth-guards.js";
import { applySettingsUpdate, getSettingsView } from "../services/settings.js";
import { testConnection } from "../services/jellyfin.js";

const updateSchema = z.object({
  jellyfinBaseUrl: z.string().url().optional(),
  jellyfinApiKey: z.string().min(1).optional(),
  tmdbApiKey: z.string().min(1).optional(),
  omdbApiKey: z.string().min(1).optional(),
  youtubeApiKey: z.string().min(1).optional(),
  dailySyncTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Secrets are never returned — only presence booleans + non-secret fields.
  app.get(
    "/api/settings",
    { preHandler: requireAdmin },
    async (): Promise<SettingsView> => getSettingsView(),
  );

  app.put("/api/settings", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid settings", details: parsed.error.flatten() });
    }
    try {
      applySettingsUpdate(parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Invalid settings" });
    }
    return getSettingsView();
  });

  app.post(
    "/api/settings/jellyfin/test",
    { preHandler: requireAdmin },
    async (): Promise<ConnectionTestResult> => {
      try {
        const info = await testConnection();
        return {
          ok: true,
          detail: `${info.ServerName ?? "Jellyfin"} (v${info.Version ?? "?"})`,
        };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : "Connection failed" };
      }
    },
  );
}
