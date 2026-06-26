import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

// Isolate the test DB in a temp dir (set before any backend module imports the
// DB singleton) and run files serially so they share one schema without races.
const dataDir = join(tmpdir(), "spudcast-test-data");

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      SPUDCAST_DATA_DIR: dataDir,
      SPUDCAST_COOKIE_SECRET: "test-secret-do-not-use-in-prod",
      LOG_LEVEL: "silent",
    },
  },
});
