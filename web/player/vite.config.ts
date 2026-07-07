import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Player ("the TV"). Served under /tv in production, so use a matching base.
export default defineConfig({
  base: "/tv/",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // ws:true so the remote-control WebSocket (/api/control) is proxied in dev.
      "/api": { target: "http://localhost:8080", ws: true },
      "/health": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
  },
});
