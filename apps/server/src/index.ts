import { networkInterfaces } from "os";
import { join } from "path";

import { initDatabase, closeDatabase, db } from "./database";
import { createApp, findWebDir } from "./app";
import { AuthService } from "./auth/service";
import { registerBuiltInPlugins } from "./plugins";
import { PluginManager } from "./plugins/manager";
import { PluginInstallationService } from "./plugins/installation";
import { PluginDiscoveryService } from "./plugins/discovery";
import { StorageManager } from "./storage";
import { ImportTaskRepository, ImportQueueProcessor } from "./queue";
import { createTrackerRuntime } from "./trackers";
import { getBooleanSetting, getSetting } from "./services/settings";

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

function getLanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }
  return urls;
}

// Global service instances (injected into routes)
declare global {
  var storageManager: StorageManager;
  var pluginManager: PluginManager;
  var pluginInstaller: PluginInstallationService;
  var pluginDiscovery: PluginDiscoveryService;
  var taskRepository: ImportTaskRepository;
  var queueProcessor: ImportQueueProcessor;
}

function isLoopbackHost(host: string): boolean {
  return ["127.0.0.1", "::1", "localhost", "[::1]"].includes(
    host.trim().toLowerCase(),
  );
}

// Initialize server
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | null = null;
let trackerSchedule: ReturnType<typeof setInterval> | null = null;

async function startServer() {
  try {
    console.log("🚀 Starting Mugiwara Server...");
    console.log(`📁 Data directory: ${DATA_DIR}`);

    // Step 1: Initialize database
    console.log("📀 Initializing database...");
    initDatabase();
    console.log("✅ Database initialized");

    // Step 2: Initialize authentication (before any request can be served)
    console.log("🔐 Initializing authentication...");
    const tokenTtlDays = Number(process.env.MUGIWARA_TOKEN_TTL_DAYS || "0");
    const authService = new AuthService(db, {
      tokenTtlMs:
        Number.isFinite(tokenTtlDays) && tokenTtlDays > 0
          ? tokenTtlDays * 24 * 60 * 60 * 1000
          : null,
    });
    const bootstrapToken =
      process.env.MUGIWARA_BOOTSTRAP_TOKEN || process.env.MUGIWARA_AUTH_TOKEN;
    if (bootstrapToken) {
      const record = await authService.ensureBootstrapToken(
        bootstrapToken,
        process.env.MUGIWARA_BOOTSTRAP_LABEL || "Bootstrap token",
      );
      if (record) {
        console.log(
          `✅ Bootstrap token provisioned for "${record.deviceLabel}" (value not logged)`,
        );
      } else {
        console.warn(
          "⚠️  MUGIWARA_BOOTSTRAP_TOKEN was ignored: tokens must be at least 24 characters.",
        );
      }
    }

    if ((await authService.countActiveTokens()) === 0) {
      const issued = authService.createPairingCode();
      console.log("\n🔑 First-run pairing code:", issued.code);
      console.log(
        `   Valid for ${Math.round(issued.ttlMs / 60000)} minutes. Enter it in the Mugiwara app to pair this device.`,
      );
      if (!isLoopbackHost(HOST)) {
        console.log(
          "   The server is reachable on the LAN; keep this code private.",
        );
      }
    }

    // Step 3: Register built-in plugins (sources and storage)
    console.log("🔌 Registering built-in plugins...");
    registerBuiltInPlugins();
    console.log("✅ Built-in plugins registered");

    // Step 4: Initialize Storage Manager
    console.log("💾 Initializing storage manager...");
    const storageManager = new StorageManager(db);
    await storageManager.initialize();
    global.storageManager = storageManager;
    console.log("✅ Storage manager initialized");

    // Step 5: Initialize Plugin Manager
    console.log("🔧 Initializing plugin manager...");
    const pluginManager = new PluginManager(db, join(DATA_DIR, "plugins"));
    await pluginManager.initialize();
    global.pluginManager = pluginManager;
    console.log("✅ Plugin manager initialized");

    // Step 6: Initialize Plugin Installation Service (hardened)
    console.log("📦 Initializing plugin installation service...");
    const pluginInstaller = new PluginInstallationService(db, DATA_DIR, {
      host: HOST,
    });
    await pluginInstaller.initialize();
    global.pluginInstaller = pluginInstaller;
    const installPolicy = pluginInstaller.getPolicy();
    if (!installPolicy.installEnabled) {
      console.log(`🔒 ${installPolicy.reason}`);
    }
    console.log("✅ Plugin installation service initialized");

    // Step 7: Initialize Plugin Discovery Service
    console.log("🔍 Initializing plugin discovery service...");
    const pluginDiscovery = new PluginDiscoveryService();
    global.pluginDiscovery = pluginDiscovery;
    console.log("✅ Plugin discovery service initialized");

    // Step 8: Initialize Import Queue
    console.log("📥 Initializing import queue...");
    const taskRepository = new ImportTaskRepository(db);
    global.taskRepository = taskRepository;

    const queueProcessor = new ImportQueueProcessor({
      repository: taskRepository,
      concurrency: 3,
      pollInterval: 5000,
    });
    global.queueProcessor = queueProcessor;

    await queueProcessor.start();
    console.log("✅ Import queue processor started");

    // Step 8.5: Initialize two-way tracker sync. The tracker queue is separate
    // from the download queue so provider outages never block reading.
    console.log("🔁 Initializing tracker sync...");
    const trackerRuntime = createTrackerRuntime({
      baseUrl:
        process.env.MUGIWARA_PUBLIC_URL?.replace(/\/+$/, "") ||
        `http://localhost:${PORT}`,
    });
    global.trackerService = trackerRuntime.service;
    global.trackerQueue = trackerRuntime.queue;

    const trackingEnabled = await getBooleanSetting("tracking.enabled");
    if (trackingEnabled) {
      if (await getBooleanSetting("tracking.pullOnStart")) {
        setTimeout(() => {
          void trackerRuntime.service
            .pullAll()
            .then((result) => {
              if (result.pulled > 0 || result.failed > 0) {
                console.log(
                  `🔁 Tracker pull on start: ${result.pulled} pulled, ${result.failed} failed`,
                );
              }
            })
            .catch((error: unknown) => {
              console.error(
                "Tracker pull on start failed:",
                error instanceof Error ? error.message : "unknown error",
              );
            });
        }, 2500).unref();
      }

      const scheduleMinutes = Number(
        (await getSetting("tracking.scheduleMinutes")) ?? "0",
      );
      if (Number.isFinite(scheduleMinutes) && scheduleMinutes > 0) {
        trackerSchedule = setInterval(
          () => {
            void trackerRuntime.service.pullAll().catch((error: unknown) => {
              console.error(
                "Scheduled tracker pull failed:",
                error instanceof Error ? error.message : "unknown error",
              );
            });
          },
          scheduleMinutes * 60 * 1000,
        );
        trackerSchedule.unref?.();
        console.log(`✅ Tracker schedule: pull every ${scheduleMinutes} min`);
      }
    }
    console.log("✅ Tracker sync initialized");

    // Step 9: Build the Express app and start HTTP server
    const webDir = findWebDir();
    const app = createApp({ authService, webDir, host: HOST });

    server = app.listen(PORT, HOST, () => {
      console.log(`\n🎉 Mugiwara server running on http://localhost:${PORT}`);
      const lanUrls = getLanUrls(PORT);
      if (lanUrls.length > 0) {
        console.log("\n📱 LAN access:");
        for (const url of lanUrls) {
          console.log(`   - ${url}`);
        }
      }
      if (webDir) {
        console.log(`\n🖥️  Web client: ${webDir}`);
      } else {
        console.warn(
          "⚠️  Web client build not found. Serving API only. " +
            "Run `pnpm --filter @mugiwara-manga/web build` or set WEB_DIR.",
        );
      }
      console.log("\n📚 API Endpoints:");
      console.log("   - Legacy: /api/manga, /api/library, /api/settings");
      console.log("   - Storage: /api/storage/*");
      console.log("   - Plugins: /api/plugins/*");
      console.log("   - Queue: /api/queue/*");
      console.log("   - Auth: POST /api/auth/pair, /api/auth/status");

      // Notify parent process (Electron) that we're ready
      if (process.send) {
        process.send("ready");
      }
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n👋 Shutting down gracefully...");

      if (global.queueProcessor) {
        console.log("⏹️  Stopping queue processor...");
        global.queueProcessor.stop();
      }

      if (trackerSchedule) {
        clearInterval(trackerSchedule);
        trackerSchedule = null;
      }
      if (global.trackerQueue) {
        global.trackerQueue.stop();
      }

      if (global.pluginManager) {
        console.log("🔌 Shutting down plugin manager...");
        await global.pluginManager.shutdown();
      }

      if (global.storageManager) {
        console.log("💾 Shutting down storage manager...");
        await global.storageManager.shutdown();
      }

      console.log("📀 Closing database...");
      closeDatabase();

      if (server) {
        console.log("🌐 Closing HTTP server...");
        server.close(() => {
          console.log("✅ Server closed");
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    process.on("message", (msg) => {
      if (msg === "shutdown") {
        shutdown();
      }
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

export { startServer };
