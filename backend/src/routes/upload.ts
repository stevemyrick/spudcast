import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { LibraryItem, LibraryItemType } from "@spudcast/shared";
import { uploadsDir } from "../config.js";
import { requireAuth } from "../auth-guards.js";
import { insertLocalItem } from "../services/library.js";

const ALLOWED_EXT = new Set([".mp4", ".m4v", ".webm", ".mov", ".mkv"]);
const ALLOWED_TYPES: LibraryItemType[] = ["commercial", "bumper", "music_video", "movie", "episode"];
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1 } });

  // Upload a local clip (bumper/commercial/etc.). Duration is supplied by the
  // client (read from the file in-browser) so spudcast needs no ffmpeg.
  app.post("/api/library/upload", { preHandler: requireAuth }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file" });

    const ext = extname(file.filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return reply.code(400).send({ error: `Unsupported file type ${ext}` });
    }

    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const title = fields.title?.value?.trim() || file.filename;
    const typeRaw = (fields.type?.value as LibraryItemType) ?? "commercial";
    const type = ALLOWED_TYPES.includes(typeRaw) ? typeRaw : "commercial";
    const durationMs = Math.max(0, Math.round(Number(fields.durationMs?.value) || 0));

    // Store under a generated name (never trust the client filename) inside the
    // data volume, which is not statically served.
    const id = randomUUID();
    const storedName = `${id}${ext}`;
    const destPath = join(uploadsDir, storedName);

    try {
      await pipeline(file.file, createWriteStream(destPath));
    } catch (err) {
      await unlink(destPath).catch(() => undefined);
      return reply.code(500).send({ error: "Upload failed" });
    }
    if (file.file.truncated) {
      await unlink(destPath).catch(() => undefined);
      return reply.code(413).send({ error: "File too large" });
    }

    const item: LibraryItem = insertLocalItem({
      externalId: id,
      title,
      type,
      durationMs,
      streamRef: storedName,
    });
    return reply.code(201).send(item);
  });
}
