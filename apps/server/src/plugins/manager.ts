import {
  MangaSource,
  StorageBackend,
  PluginConfig,
} from "@mugiwara-manga/plugin-api";
import { InstalledPluginRecord, LoadedPlugin } from "./types";
import {
  getSourceFactory,
  getStorageFactory,
  registerSource,
  registerStorage,
  unregisterSource,
} from "./registry";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
import * as schema from "../database/schema";

// Hardcoded built-in plugins - always available
const BUILT_IN_SOURCES: Array<{
  id: string;
  name: string;
  config: PluginConfig;
}> = [
  { id: "local", name: "Local Files", config: { directories: [] } },
];

const BUILT_IN_STORAGE: Array<{
  id: string;
  name: string;
  config: PluginConfig;
}> = [
  { id: "local", name: "Local Storage", config: { basePath: "./data/manga" } },
];

export class PluginManager {
  private sources: Map<string, LoadedPlugin> = new Map();
  private storage: Map<string, LoadedPlugin> = new Map();
  private db: any;
  private pluginsDir: string;

  constructor(db: any, pluginsDir: string) {
    this.db = db;
    this.pluginsDir = pluginsDir;
  }

  async initialize(): Promise<void> {
    // Step 1: Load hardcoded built-in plugins
    console.log("🔌 Loading built-in plugins...");

    for (const builtIn of BUILT_IN_SOURCES) {
      await this.loadBuiltInSource(builtIn);
    }

    for (const builtIn of BUILT_IN_STORAGE) {
      await this.loadBuiltInStorage(builtIn);
    }

    // Step 2: Load optional plugins from database
    console.log("📦 Loading installed plugins...");
    const plugins = await this.db.query.installedPlugins.findMany({
      where: eq(schema.installedPlugins.isEnabled, true),
    });

    for (const record of plugins) {
      try {
        await loadPluginFromDB(
          record,
          this.sources,
          this.storage,
          this.pluginsDir,
        );
      } catch (err) {
        console.error(`Failed to load plugin ${record.id}:`, err);
      }
    }

    console.log(
      `✅ Loaded ${this.sources.size} sources and ${this.storage.size} storage backends`,
    );
  }

  async shutdown(): Promise<void> {
    // Shutdown all plugins
    for (const plugin of this.sources.values()) {
      await (plugin.instance as MangaSource).shutdown();
    }
    for (const plugin of this.storage.values()) {
      await (plugin.instance as StorageBackend).shutdown();
    }
    this.sources.clear();
    this.storage.clear();
  }

  private async loadBuiltInSource(builtIn: {
    id: string;
    name: string;
    config: PluginConfig;
  }): Promise<void> {
    const factory = getSourceFactory(builtIn.id);
    if (!factory) {
      console.error(`No factory registered for built-in source: ${builtIn.id}`);
      return;
    }

    const instance = factory(builtIn.config);
    await instance.initialize(builtIn.config);

    const loadedPlugin: LoadedPlugin = {
      record: {
        id: `@mugiwara-manga/source-${builtIn.id}`,
        type: "source",
        version: "1.0.0",
        isBuiltin: true,
        isEnabled: true,
        config: builtIn.config,
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      instance,
      metadata: instance.metadata,
    };

    this.sources.set(builtIn.id, loadedPlugin);
    console.log(`  ✓ ${builtIn.name}`);
  }

  private async loadBuiltInStorage(builtIn: {
    id: string;
    name: string;
    config: PluginConfig;
  }): Promise<void> {
    const factory = getStorageFactory(builtIn.id);
    if (!factory) {
      console.error(
        `No factory registered for built-in storage: ${builtIn.id}`,
      );
      return;
    }

    const instance = factory(builtIn.config);
    await instance.initialize(builtIn.config);

    const loadedPlugin: LoadedPlugin = {
      record: {
        id: `@mugiwara-manga/storage-${builtIn.id}`,
        type: "storage",
        version: "1.0.0",
        isBuiltin: true,
        isEnabled: true,
        config: builtIn.config,
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      instance,
      metadata: instance.metadata,
    };

    this.storage.set(builtIn.id, loadedPlugin);
    console.log(`  ✓ ${builtIn.name}`);
  }

  getSource(id: string): MangaSource | undefined {
    const plugin = this.sources.get(id);
    return plugin ? (plugin.instance as MangaSource) : undefined;
  }

  getStorage(id: string): StorageBackend | undefined {
    const plugin = this.storage.get(id);
    return plugin ? (plugin.instance as StorageBackend) : undefined;
  }

  getAllSources(): MangaSource[] {
    return Array.from(this.sources.values()).map(
      (p) => p.instance as MangaSource,
    );
  }

  getAllStorage(): StorageBackend[] {
    return Array.from(this.storage.values()).map(
      (p) => p.instance as StorageBackend,
    );
  }

  getLoadedPlugins(): LoadedPlugin[] {
    return [...this.sources.values(), ...this.storage.values()];
  }

  // Only for optional plugins from DB
  async enablePlugin(packageName: string): Promise<void> {
    await this.db
      .update(schema.installedPlugins)
      .set({ isEnabled: true })
      .where(eq(schema.installedPlugins.id, packageName));

    const record = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (record) {
      await loadPluginFromDB(
        record,
        this.sources,
        this.storage,
        this.pluginsDir,
      );
    }
  }

  async disablePlugin(packageName: string): Promise<void> {
    const record = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (!record) return;

    // Shutdown and remove
    if (record.type === "source") {
      const plugin = Array.from(this.sources.values()).find(
        (p) => p.record.id === packageName,
      );
      if (plugin && !plugin.record.isBuiltin) {
        await (plugin.instance as MangaSource).shutdown();
        this.sources.delete(plugin.metadata.id);
        unregisterSource(plugin.metadata.id);
      }
    } else {
      const plugin = Array.from(this.storage.values()).find(
        (p) => p.record.id === packageName,
      );
      if (plugin && !plugin.record.isBuiltin) {
        await (plugin.instance as StorageBackend).shutdown();
        this.storage.delete(plugin.metadata.id);
      }
    }

    await this.db
      .update(schema.installedPlugins)
      .set({ isEnabled: false })
      .where(eq(schema.installedPlugins.id, packageName));
  }

  async updatePluginConfig(
    packageName: string,
    config: PluginConfig,
  ): Promise<void> {
    await this.db
      .update(schema.installedPlugins)
      .set({ config })
      .where(eq(schema.installedPlugins.id, packageName));

    // Reload the plugin
    const record = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (record && record.isEnabled) {
      await this.disablePlugin(packageName);
      await this.enablePlugin(packageName);
    }
  }
}

// Helper function to load plugins from database records
async function loadPluginFromDB(
  record: InstalledPluginRecord,
  sources: Map<string, LoadedPlugin>,
  storage: Map<string, LoadedPlugin>,
  pluginsDir: string,
): Promise<void> {
  // Load plugin module via CJS require (handles .jsx/.tsx via tsx hooks)
  const pluginRequire = createRequire(pluginsDir + "/package.json");
  const mod = pluginRequire(record.id);
  const factory = mod.default || mod;

  if (typeof factory !== "function") {
    throw new Error(`Plugin ${record.id} does not export a factory function`);
  }

  // Create instance directly from the dynamically imported factory
  const instance: MangaSource | StorageBackend = factory(record.config);

  // Initialize the plugin
  await instance.initialize(record.config);

  // Register factory into the registry so API endpoints can discover this plugin
  if (record.type === "source") {
    registerSource(instance.metadata.id, factory);
  } else {
    registerStorage(instance.metadata.id, factory);
  }

  const loadedPlugin: LoadedPlugin = {
    record,
    instance,
    metadata: instance.metadata,
  };

  // Store in appropriate map
  if (record.type === "source") {
    sources.set(instance.metadata.id, loadedPlugin);
  } else {
    storage.set(instance.metadata.id, loadedPlugin);
  }

  console.log(`✅ Loaded plugin: ${instance.metadata.name} (${record.id})`);
}
