import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@spudcast/shared";

const startedAt = Date.now();
const VERSION = "0.0.0";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => ({
    status: "ok",
    version: VERSION,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  }));
}
