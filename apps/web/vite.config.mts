import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base keeps the build working when it is served by the local
  // server (same origin), loaded by Electron, or bundled by Capacitor.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The app deliberately ships as one vendor bundle for the Electron and
    // Capacitor shells (no network waterfall on first load). Radix adds
    // roughly 200 kB raw / 60 kB gzip over the previous hand-rolled UI.
    chunkSizeWarningLimit: 700,
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
