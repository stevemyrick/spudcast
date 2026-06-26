import { config, ensureDataDirs } from "./config.js";
import { migrate } from "./db.js";
import { buildApp } from "./app.js";
import { startSyncSchedule } from "./services/syncSchedule.js";

async function main(): Promise<void> {
  ensureDataDirs();
  migrate();

  const app = await buildApp({ serveStatic: true });

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
