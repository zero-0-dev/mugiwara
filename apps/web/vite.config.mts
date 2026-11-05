import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Absolute base so deep links such as /manga/:id load /assets/* from the
  // server root. Browser history routing needs that; Electron loads the same
  // server origin and Capacitor serves the bundle at http://localhost.
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The app deliberately ships as one vendor bundle for the Electron and
    // Capacitor shells (no network waterfall on first load). Radix plus React
    // Router and the Capacitor bridge add roughly 220 kB gzip.
    chunkSizeWarningLimit: 800,
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
