import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Channel, ChannelWithItems, NowPlaying, ScheduledProgram } from "@spudcast/shared";
import { requireAuth, requireViewer } from "../auth-guards.js";
import {
  addItems,
  createChannel,
  deleteChannel,
  getById,
  getItems,
  listChannels,
  resolveChannelItems,
  setItems,
  setOnAir,
  updateChannel,
} from "../services/channels.js";
import { getGuide, nowPlaying } from "../services/scheduler.js";
import { getById as getLibraryItem } from "../services/library.js";

const rulesSchema = z.object({
  genres: z.array(z.string().max(64)).max(40).optional(),
  yearFrom: z.number().int().min(1870).max(2100).optional(),
  yearTo: z.number().int().min(1870).max(2100).optional(),
  types: z.array(z.enum(["movie", "episode", "commercial", "bumper", "music_video"])).optional(),
  sources: z.array(z.enum(["jellyfin", "youtube", "local"])).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
});

const configSchema = z.object({
  filler: z
    .object({
      enabled: z.boolean(),
      perBreak: z.number().int().min(0).max(10),
    })
    .optional(),
});

const createSchema = z.object({
  number: z.number().int().min(1).max(9999),
  name: z.string().min(1).max(120),
  type: z.enum(["manual", "auto", "weather"]).optional(),
  strategy: z.enum(["ordered", "shuffle", "dayparts"]).optional(),
  onAir: z.boolean().optional(),
  rules: rulesSchema.optional(),
  config: configSchema.optional(),
});

const itemsSchema = z.object({
  libraryItemIds: z.array(z.number().int().positive()).min(1).max(1000),
});

const setItemsSchema = z.object({
  libraryItemIds: z.array(z.number().int().positive()).max(1000),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  number: z.number().int().min(1).max(9999).optional(),
  strategy: z.enum(["ordered", "shuffle", "dayparts"]).optional(),
  iconUrl: z.string().max(2048).nullable().optional(),
  onAir: z.boolean().optional(),
  config: configSchema.optional(),
});

/** Owner or admin may modify a channel. */
function canEdit(channel: Channel, user: { id: number; role: string }): boolean {
  return user.role === "admin" || channel.ownerId === user.id;
}

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  // The shared on-air lineup the TV sees; full list (incl. off-air) for editors.
  // Devices only ever get the on-air lineup; `all=true` is honored for users.
  app.get("/api/channels", { preHandler: requireViewer }, async (req): Promise<Channel[]> => {
    const wantsAll = (req.query as { all?: string })?.all === "true";
    const all = wantsAll && Boolean(req.currentUser);
    return listChannels({ onAirOnly: !all });
  });

  app.post("/api/channels", { preHandler: requireAuth }, async (req, reply): Promise<Channel | void> => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid channel" });
    try {
      return createChannel(req.currentUser!.id, parsed.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      return reply.code(msg.includes("UNIQUE") ? 409 : 400).send({ error: msg });
    }
  });

  // Full channel + ordered playlist, for the editor.
  app.get("/api/channels/:id", { preHandler: requireAuth }, async (req, reply): Promise<ChannelWithItems | void> => {
    const channel = getById(Number((req.params as { id: string }).id));
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    if (!canEdit(channel, req.currentUser!)) return reply.code(403).send({ error: "Not your channel" });
    // Auto channels show their resolved lineup (incl. filler) read-only; manual
    // channels show the raw editable playlist (filler is applied at playback only).
    const items = channel.type === "auto" ? resolveChannelItems(channel) : getItems(channel.id);
    return { channel, items };
  });

  app.put("/api/channels/:id", { preHandler: requireAuth }, async (req, reply): Promise<Channel | void> => {
    const channel = getById(Number((req.params as { id: string }).id));
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    if (!canEdit(channel, req.currentUser!)) return reply.code(403).send({ error: "Not your channel" });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid update" });
    try {
      return updateChannel(channel.id, parsed.data)!;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      return reply.code(msg.includes("UNIQUE") ? 409 : 400).send({ error: msg });
    }
  });

  app.delete("/api/channels/:id", { preHandler: requireAuth }, async (req, reply) => {
    const channel = getById(Number((req.params as { id: string }).id));
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    if (!canEdit(channel, req.currentUser!)) return reply.code(403).send({ error: "Not your channel" });
    deleteChannel(channel.id);
    return { ok: true };
  });

  // Replace the whole playlist (used for reorder/remove/add from the editor).
  app.put("/api/channels/:id/items", { preHandler: requireAuth }, async (req, reply) => {
    const channel = getById(Number((req.params as { id: string }).id));
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    if (!canEdit(channel, req.currentUser!)) return reply.code(403).send({ error: "Not your channel" });
    const parsed = setItemsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid items" });
    for (const id of parsed.data.libraryItemIds) {
      if (!getLibraryItem(id)) return reply.code(400).send({ error: `Unknown library item ${id}` });
    }
    setItems(channel.id, parsed.data.libraryItemIds);
    return { ok: true, items: getItems(channel.id).length };
  });

  app.post("/api/channels/:id/items", { preHandler: requireAuth }, async (req, reply) => {
    const channel = getById(Number((req.params as { id: string }).id));
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    if (!canEdit(channel, req.currentUser!)) return reply.code(403).send({ error: "Not your channel" });
    const parsed = itemsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid items" });
    // Verify the referenced library items exist before linking them.
    for (const id of parsed.data.libraryItemIds) {
      if (!getLibraryItem(id)) return reply.code(400).send({ error: `Unknown library item ${id}` });
    }
    addItems(channel.id, parsed.data.libraryItemIds);
    return { ok: true, items: getItems(channel.id).length };
  });

  app.post("/api/channels/:id/on-air", { preHandler: requireAuth }, async (req, reply) => {
    const channel = getById(Number((req.params as { id: string }).id));
    if (!channel) return reply.code(404).send({ error: "Channel not found" });
    if (!canEdit(channel, req.currentUser!)) return reply.code(403).send({ error: "Not your channel" });
    const onAir = Boolean((req.body as { onAir?: boolean })?.onAir);
    setOnAir(channel.id, onAir);
    return { ...channel, onAir };
  });

  // "What's on channel N now?" — reads only from the SQLite cache.
  app.get("/api/now-playing/:number", { preHandler: requireViewer }, async (req, reply): Promise<NowPlaying | void> => {
    const np = nowPlaying(Number((req.params as { number: string }).number));
    if (!np) return reply.code(404).send({ error: "Nothing scheduled" });
    return np;
  });

  app.get("/api/guide/:number", { preHandler: requireViewer }, async (req): Promise<ScheduledProgram[]> => {
    const count = Math.min(Math.max(Number((req.query as { count?: string })?.count) || 8, 1), 50);
    return getGuide(Number((req.params as { number: string }).number), count);
  });
}
