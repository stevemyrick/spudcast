import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../auth-guards.js";
import { getByNumber, listChannels } from "../services/channels.js";
import { getGuide, nowPlaying } from "../services/scheduler.js";
import {
  getOrCreateIptvKey,
  isValidIptvKey,
  regenerateIptvKey,
} from "../services/settings.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** XMLTV timestamp: 20260625143000 +0000 */
function xmltvTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`
  );
}

function baseUrlOf(req: FastifyRequest): string {
  const host = req.headers.host ?? "localhost";
  return `${req.protocol}://${host}`;
}

/** Gate /api/iptv/* on the capability key (?key=). */
function keyOk(req: FastifyRequest, reply: FastifyReply): boolean {
  if (isValidIptvKey((req.query as { key?: string })?.key)) return true;
  reply.code(401).send({ error: "Invalid or missing key" });
  return false;
}

export async function iptvRoutes(app: FastifyInstance): Promise<void> {
  // Admin: reveal the key + ready-made URLs for the player apps.
  app.get("/api/iptv/info", { preHandler: requireAdmin }, async (req) => {
    const key = getOrCreateIptvKey();
    const base = baseUrlOf(req);
    return {
      key,
      playlistUrl: `${base}/api/iptv/playlist.m3u?key=${key}`,
      xmltvUrl: `${base}/api/iptv/xmltv.xml?key=${key}`,
    };
  });

  app.post("/api/iptv/regenerate", { preHandler: requireAdmin }, async () => ({
    key: regenerateIptvKey(),
  }));

  // M3U playlist of on-air channels. Each entry points at the per-channel stream
  // hand-off below (which redirects to the current program via spudcast's proxy,
  // so the Jellyfin key is never exposed to the external player).
  app.get("/api/iptv/playlist.m3u", async (req, reply) => {
    if (!keyOk(req, reply)) return;
    const key = (req.query as { key: string }).key;
    const base = baseUrlOf(req);
    const lines = ["#EXTM3U"];
    for (const c of listChannels({ onAirOnly: true })) {
      lines.push(
        `#EXTINF:-1 tvg-id="spud.${c.number}" tvg-name="${escapeXml(c.name)}" ` +
          `tvg-chno="${c.number}" group-title="spudcast",${c.name}`,
      );
      lines.push(`${base}/api/iptv/stream/${c.number}?key=${key}`);
    }
    return reply.type("audio/x-mpegurl").send(lines.join("\n") + "\n");
  });

  // XMLTV guide for on-air channels, from the deterministic schedule.
  app.get("/api/iptv/xmltv.xml", async (req, reply) => {
    if (!keyOk(req, reply)) return;
    const channels = listChannels({ onAirOnly: true });
    const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="spudcast">'];
    for (const c of channels) {
      out.push(
        `<channel id="spud.${c.number}"><display-name>${escapeXml(`${c.number} ${c.name}`)}</display-name></channel>`,
      );
    }
    for (const c of channels) {
      for (const p of getGuide(c.number, 50)) {
        out.push(
          `<programme start="${xmltvTime(p.startUtc)}" stop="${xmltvTime(p.endUtc)}" channel="spud.${c.number}">` +
            `<title>${escapeXml(p.item.title)}</title></programme>`,
        );
      }
    }
    out.push("</tv>");
    return reply.type("application/xml").send(out.join("\n"));
  });

  // Per-channel hand-off: redirect the external player to the current program's
  // proxied stream (key carried so the proxy authorizes it). Weather channels
  // can't be served as a video stream.
  app.get("/api/iptv/stream/:number", async (req, reply) => {
    if (!keyOk(req, reply)) return;
    const key = (req.query as { key: string }).key;
    const channel = getByNumber(Number((req.params as { number: string }).number));
    if (!channel) return reply.code(404).send({ error: "No such channel" });
    const np = nowPlaying(channel.number);
    if (!np || np.kind !== "program") {
      return reply.code(404).send({ error: "Nothing streamable on this channel" });
    }
    const item = np.item;
    const path =
      item.source === "local"
        ? `/api/stream/local/${item.id}`
        : `/api/stream/jellyfin/${item.streamRef}`;
    return reply.redirect(`${path}?token=${key}`, 302);
  });
}
