import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { requireViewer } from "../auth-guards.js";
import { buildAudioStreamUrl, buildStreamUrl } from "../services/jellyfin.js";
import { getById as getLibraryItem } from "../services/library.js";
import { uploadsDir } from "../config.js";

const ID_RE = /^[a-f0-9]{32}$/i;

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

/** Headers worth forwarding from the upstream Jellyfin response to the player. */
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges"];

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  // Proxy a Jellyfin direct-play stream. The api_key is injected server-side and
  // never reaches the browser; Range requests are forwarded for seeking.
  app.get("/api/stream/jellyfin/:id", { preHandler: requireViewer }, async (req, reply) => {
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

  // Proxy a Jellyfin audio stream (weather-channel background music). Key hidden.
  app.get("/api/stream/jellyfin-audio/:id", { preHandler: requireViewer }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ID_RE.test(id)) return reply.code(400).send({ error: "Invalid id" });

    const headers: Record<string, string> = {};
    if (req.headers.range) headers.range = req.headers.range;
    const upstream = await fetch(buildAudioStreamUrl(id), { headers });
    if (!upstream.ok && upstream.status !== 206) {
      return reply.code(upstream.status === 404 ? 404 : 502).send({ error: "Upstream audio error" });
    }
    reply.code(upstream.status);
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    if (!upstream.body) return reply.send();
    return reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
  });

  // Serve a locally-uploaded clip from the data volume, with Range support.
  app.get("/api/stream/local/:id", { preHandler: requireViewer }, async (req, reply) => {
    const item = getLibraryItem(Number((req.params as { id: string }).id));
    if (!item || item.source !== "local") return reply.code(404).send({ error: "Not found" });

    // streamRef is a generated basename; basename() defends against traversal.
    const filePath = join(uploadsDir, basename(item.streamRef));
    let size: number;
    try {
      size = (await stat(filePath)).size;
    } catch {
      return reply.code(404).send({ error: "File missing" });
    }

    const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    reply.header("Accept-Ranges", "bytes").header("Content-Type", type);

    const range = req.headers.range;
    const m = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      }
      reply.code(206).header("Content-Range", `bytes ${start}-${end}/${size}`).header("Content-Length", end - start + 1);
      return reply.send(createReadStream(filePath, { start, end }));
    }
    reply.header("Content-Length", size);
    return reply.send(createReadStream(filePath));
  });
}
