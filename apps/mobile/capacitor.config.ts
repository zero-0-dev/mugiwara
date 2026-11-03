import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.zero.mugiwara",
  appName: "Mugiwara",
  // The same Vite build used by the browser and Electron shell.
  webDir: "../web/dist",
  server: {
    // Serve the bundled app from http://localhost. The Mugiwara server is a
    // plain-HTTP LAN service, and Android WebView refuses to load <img> assets
    // from an HTTP origin when the app itself is served over HTTPS (mixed
    // content), even with allowMixedContent enabled. Same scheme avoids that.
    androidScheme: "http",
    // The bundled web client talks to a plain-HTTP Mugiwara server on the LAN.
    cleartext: true,
  },
  android: {
    // The app is bundled locally but talks to a plain-HTTP server on the LAN.
    // Android WebView blocks mixed content by default.
    allowMixedContent: true,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
