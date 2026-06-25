import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../auth-guards.js";
import {
  claimPairing,
  listDevices,
  pollPairing,
  revokeDevice,
  startPairing,
} from "../services/devices.js";

const claimSchema = z.object({
  code: z.string().min(4).max(12),
  name: z.string().min(1).max(60).default("TV"),
});

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  // --- TV side (unauthenticated: the TV has no credentials yet) ---
  app.post("/api/devices/pair/start", async () => startPairing());

  app.get("/api/devices/pair/poll", async (req, reply) => {
    const pairingId = (req.query as { pairingId?: string })?.pairingId;
    if (!pairingId) return reply.code(400).send({ error: "Missing pairingId" });
    return pollPairing(pairingId);
  });

  // --- Admin side ---
  app.post("/api/devices/pair/claim", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid claim" });
    try {
      const device = claimPairing(parsed.data.code, parsed.data.name);
      // Return only non-secret fields; the token goes to the TV via poll.
      return { id: device.id, name: device.name, kind: device.kind };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Claim failed" });
    }
  });

  app.get("/api/devices", { preHandler: requireAdmin }, async () => listDevices());

  app.delete("/api/devices/:id", { preHandler: requireAdmin }, async (req) => {
    revokeDevice(Number((req.params as { id: string }).id));
    return { ok: true };
  });
}
