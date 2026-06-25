import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth-guards.js";
import { buildStreamUrl } from "../services/jellyfin.js";

const ID_RE = /^[a-f0-9]{32}$/i;

/** Headers worth forwarding from the upstream Jellyfin response to the player. */
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  // Proxy a Jellyfin direct-play stream. The api_key is injected server-side and
  // never reaches the browser; Range requests are forwarded for seeking.
  app.get("/api/stream/jellyfin/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ID_RE.test(id)) return reply.code(400).send({ error: "Invalid id" });

    const upstreamUrl = buildStreamUrl(id, { transcode: false });
    const headers: Record<string, string> = {};
    if (req.headers.range) headers.range = req.headers.range;

    const upstream = await fetch(upstreamUrl, { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return reply.code(upstream.status === 404 ? 404 : 502).send({ error: "Upstream stream error" });
    }

    reply.code(upstream.status);
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    if (!upstream.body) return reply.send();
    return reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
  });
}
