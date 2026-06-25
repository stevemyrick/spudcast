import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { config, ensureDataDirs } from "./config.js";
import { migrate } from "./db.js";
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
import { startSyncSchedule } from "./services/syncSchedule.js";

async function main(): Promise<void> {
  ensureDataDirs();
  migrate();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      // Never let request bodies leak secrets into logs.
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    bodyLimit: 5 * 1024 * 1024,
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

  // Serve the built frontends in production: admin at /, player at /tv.
  const adminDir = join(config.webDir, "admin");
  const playerDir = join(config.webDir, "player");
  if (existsSync(adminDir)) {
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

  // Daily library sync ticker — the only background Jellyfin traffic.
  startSyncSchedule({
    info: (msg) => app.log.info(msg),
    error: (msg) => app.log.error(msg),
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`spudcast backend listening on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
