import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConnectionTestResult, SettingsView } from "@spudcast/shared";
import { requireAdmin, requireViewer } from "../auth-guards.js";
import { applySettingsUpdate, getSettingsView, setStationPin, verifyStationPin } from "../services/settings.js";
import { testConnection } from "../services/jellyfin.js";
import { loginLockSeconds, recordLoginFailure, recordLoginSuccess } from "../services/rate-limit.js";

const updateSchema = z.object({
  jellyfinBaseUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: "baseUrl must be http(s)" })
    .optional(),
  jellyfinApiKey: z.string().min(1).optional(),
  tmdbApiKey: z.string().min(1).optional(),
  omdbApiKey: z.string().min(1).optional(),
  youtubeApiKey: z.string().min(1).optional(),
  dailySyncTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timezone: z.string().min(1).max(64).optional(),
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

  // Set or clear the household/parental PIN (empty string clears it).
  app.put("/api/settings/pin", { preHandler: requireAdmin }, async (req, reply): Promise<SettingsView> => {
    const parsed = z.object({ pin: z.string().max(32) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid PIN" }) as never;
    await setStationPin(parsed.data.pin.trim());
    return getSettingsView();
  });

  // The TV verifies a PIN to unlock locked channels. Throttled per IP.
  app.post("/api/tv/verify-pin", { preHandler: requireViewer }, async (req, reply): Promise<{ ok: boolean }> => {
    const key = `pin:${req.ip}`;
    const locked = loginLockSeconds(key);
    if (locked > 0) return reply.code(429).header("Retry-After", String(locked)).send({ error: "Too many attempts" }) as never;
    const parsed = z.object({ pin: z.string().max(32) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid PIN" }) as never;
    const ok = await verifyStationPin(parsed.data.pin);
    if (ok) recordLoginSuccess(key);
    else recordLoginFailure(key);
    return { ok };
  });
}
