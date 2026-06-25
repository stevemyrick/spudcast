import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { artworkCacheDir } from "../config.js";
import { requireAuth } from "../auth-guards.js";
import { fetchImage } from "../services/jellyfin.js";

// Jellyfin item ids are 32-char hex GUIDs; restrict to that to avoid traversal.
const ID_RE = /^[a-f0-9]{32}$/i;

export async function artRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/art/jellyfin/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ID_RE.test(id)) {
      return reply.code(400).send({ error: "Invalid id" });
    }

    const binPath = join(artworkCacheDir, `${id}.bin`);
    const typePath = join(artworkCacheDir, `${id}.type`);

    // Serve from cache if present — no Jellyfin call, so media disks stay asleep.
    if (existsSync(binPath) && existsSync(typePath)) {
      const [body, contentType] = await Promise.all([
        readFile(binPath),
        readFile(typePath, "utf8"),
      ]);
      return reply.header("Content-Type", contentType).header("Cache-Control", "public, max-age=86400").send(body);
    }

    const img = await fetchImage(id);
    if (!img) {
      return reply.code(404).send({ error: "Image not found" });
    }
    const buf = Buffer.from(img.body);
    // Cache to disk for next time (best-effort; ignore write errors).
    await Promise.all([
      writeFile(binPath, buf).catch(() => undefined),
      writeFile(typePath, img.contentType).catch(() => undefined),
    ]);
    return reply
      .header("Content-Type", img.contentType)
      .header("Cache-Control", "public, max-age=86400")
      .send(buf);
  });
}
