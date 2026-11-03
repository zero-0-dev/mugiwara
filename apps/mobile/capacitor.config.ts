import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.zero.mugiwara",
  appName: "Mugiwara",
  // The same Vite build used by the browser and Electron shell.
  webDir: "../web/dist",
  server: {
    androidScheme: "https",
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
