import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { config } from "./config.js";
import { resolveCookieSecret } from "./session.js";
import { healthRoutes } from "./routes/health.js";
import { setupRoutes } from "./routes/setup.js";
import { authRoutes } from "./routes/auth.js";
import { libraryRoutes } from "./routes/library.js";
import { settingsRoutes } from "./routes/settings.js";
import { artRoutes } from "./routes/art.js";
import { channelRoutes } from "./routes/channels.js";
import { streamRoutes } from "./routes/stream.js";
import { deviceRoutes } from "./routes/devices.js";
import { controlRoutes } from "./routes/control.js";
import { userRoutes } from "./routes/users.js";
import { uploadRoutes } from "./routes/upload.js";
import { iptvRoutes } from "./routes/iptv.js";

export interface BuildAppOptions {
  /** Disable logging (tests). */
  logger?: boolean;
  /** Serve the built admin/player bundles (production); off by default in tests. */
  serveStatic?: boolean;
}

/**
 * Build a fully-wired Fastify instance (no listen) so both the server entrypoint
 * and the test suite share the exact same app.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false
      ? false
      : {
          level: process.env.LOG_LEVEL ?? "info",
          redact: ["req.headers.authorization", "req.headers.cookie"],
          serializers: {
            // Strip capability tokens/keys from the logged URL (they ride in the
            // query string for <video>/<img>/IPTV requests).
            req(req: { method: string; url: string; ip?: string }) {
              return {
                method: req.method,
                url: req.url.replace(/([?&](?:token|key|api_key)=)[^&]*/gi, "$1REDACTED"),
                remoteAddress: req.ip,
              };
            },
          },
        },
    bodyLimit: 5 * 1024 * 1024,
  });

  // Cheap, safe hardening: stop content-type sniffing on proxied media/art.
  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
  });

  await app.register(cookie, { secret: resolveCookieSecret() });

  await app.register(healthRoutes);
  await app.register(setupRoutes);
  await app.register(authRoutes);
  await app.register(libraryRoutes);
  await app.register(settingsRoutes);
  await app.register(artRoutes);
  await app.register(channelRoutes);
  await app.register(streamRoutes);
  await app.register(deviceRoutes);
  await app.register(controlRoutes);
  await app.register(userRoutes);
  await app.register(uploadRoutes);
  await app.register(iptvRoutes);

  // Serve the built frontends in production: admin at /, player at /tv.
  const adminDir = join(config.webDir, "admin");
  const playerDir = join(config.webDir, "player");
  if (opts.serveStatic && existsSync(adminDir)) {
    await app.register(fastifyStatic, { root: playerDir, prefix: "/tv/", decorateReply: false });
    await app.register(fastifyStatic, { root: adminDir, prefix: "/" });
    // SPA fallback for client-side routing (skip API + health + player routes).
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/health")) {
        return reply.code(404).send({ error: "Not found" });
      }
      if (req.url.startsWith("/tv")) {
        return reply.sendFile("index.html", playerDir);
      }
      return reply.sendFile("index.html", adminDir);
    });
  }

  return app;
}
