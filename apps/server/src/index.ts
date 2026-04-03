import express, { Request, Response } from "express";
import cors from "cors";
import { join } from "path";

import { initDatabase, closeDatabase, db } from "./database";
import { registerBuiltInPlugins } from "./plugins";
import { PluginManager } from "./plugins/manager";
import { PluginInstallationService } from "./plugins/installation";
import { PluginDiscoveryService } from "./plugins/discovery";
import { StorageManager } from "./storage";
import { ImportTaskRepository, ImportQueueProcessor } from "./queue";

// API Routes
import mangaRoutes from "./api/manga";
import chapterRoutes from "./api/chapters";
import libraryRoutes from "./api/library";
import contentRoutes from "./api/content";
import metadataRoutes from "./api/metadata";
import filtersRoutes from "./api/filters";
import settingsRoutes from "./api/settings";
import categoriesRoutes from "./api/categories";

// New API Routes
import storageRoutes from "./api/storage";
import pluginsRoutes from "./api/plugins";
import queueRoutes from "./api/queue";

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

// Global service instances (injected into routes)
declare global {
  var storageManager: StorageManager;
  var pluginManager: PluginManager;
  var pluginInstaller: PluginInstallationService;
  var pluginDiscovery: PluginDiscoveryService;
  var taskRepository: ImportTaskRepository;
  var queueProcessor: ImportQueueProcessor;
}

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Request logging
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Legacy API Routes
app.use("/api/manga", mangaRoutes);
app.use("/api/manga/:mangaId/chapters", chapterRoutes);
app.use("/api/manga/:mangaId/metadata", metadataRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/library", filtersRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/content", contentRoutes);

// New API Routes
app.use("/api/storage", storageRoutes);
app.use("/api/plugins", pluginsRoutes);
app.use("/api/queue", queueRoutes);

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
  });
});

// Error handling
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  },
);

// Initialize server
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    console.log("🚀 Starting Mugiwara Server...");
    console.log(`📁 Data directory: ${DATA_DIR}`);

    // Step 1: Initialize database
    console.log("📀 Initializing database...");
    initDatabase();
    console.log("✅ Database initialized");

    // Step 2: Register built-in plugins (sources and storage)
    console.log("🔌 Registering built-in plugins...");
    registerBuiltInPlugins();
    console.log("✅ Built-in plugins registered");

    // Step 3: Initialize Storage Manager
    console.log("💾 Initializing storage manager...");
    const storageManager = new StorageManager(db);
    await storageManager.initialize();
    global.storageManager = storageManager;
    console.log("✅ Storage manager initialized");

    // Step 4: Initialize Plugin Manager
    console.log("🔧 Initializing plugin manager...");
    const pluginManager = new PluginManager(db, join(DATA_DIR, "plugins"));
    await pluginManager.initialize();
    global.pluginManager = pluginManager;
    console.log("✅ Plugin manager initialized");

    // Step 5: Initialize Plugin Installation Service
    console.log("📦 Initializing plugin installation service...");
    const pluginInstaller = new PluginInstallationService(db, DATA_DIR);
    await pluginInstaller.initialize();
    global.pluginInstaller = pluginInstaller;
    console.log("✅ Plugin installation service initialized");

    // Step 6: Initialize Plugin Discovery Service
    console.log("🔍 Initializing plugin discovery service...");
    const pluginDiscovery = new PluginDiscoveryService();
    global.pluginDiscovery = pluginDiscovery;
    console.log("✅ Plugin discovery service initialized");

    // Step 7: Initialize Import Queue
    console.log("📥 Initializing import queue...");
    const taskRepository = new ImportTaskRepository(db);
    global.taskRepository = taskRepository;

    const queueProcessor = new ImportQueueProcessor({
      repository: taskRepository,
      concurrency: 3,
      pollInterval: 5000,
    });
    global.queueProcessor = queueProcessor;

    // Start the queue processor
    await queueProcessor.start();
    console.log("✅ Import queue processor started");

    // Step 8: Start HTTP server
    server = app.listen(PORT, () => {
      console.log(`\n🎉 Mugiwara server running on http://localhost:${PORT}`);
      console.log("\n📚 API Endpoints:");
      console.log("   - Legacy: /api/manga, /api/library, /api/settings");
      console.log("   - Storage: /api/storage/*");
      console.log("   - Plugins: /api/plugins/*");
      console.log("   - Queue: /api/queue/*");

      // Notify parent process (Electron) that we're ready
      if (process.send) {
        process.send("ready");
      }
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n👋 Shutting down gracefully...");

      // Stop queue processor
      if (global.queueProcessor) {
        console.log("⏹️  Stopping queue processor...");
        global.queueProcessor.stop();
      }

      // Shutdown plugin manager
      if (global.pluginManager) {
        console.log("🔌 Shutting down plugin manager...");
        await global.pluginManager.shutdown();
      }

      // Shutdown storage manager
      if (global.storageManager) {
        console.log("💾 Shutting down storage manager...");
        await global.storageManager.shutdown();
      }

      // Close database
      console.log("📀 Closing database...");
      closeDatabase();

      // Close HTTP server
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

    // Handle messages from parent process (Electron)
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

startServer();
