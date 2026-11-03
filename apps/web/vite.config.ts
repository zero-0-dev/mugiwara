import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  // Relative base keeps the build working when it is served by the local
  // server (same origin), loaded by Electron, or bundled by Capacitor.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Expose the dev server on the LAN so phones can test the web UI.
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
    },
  },
});
