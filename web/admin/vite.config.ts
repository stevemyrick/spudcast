import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin (Channel Creator) dev server. API calls are proxied to the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
  build: {
    outDir: "dist",
  },
});
