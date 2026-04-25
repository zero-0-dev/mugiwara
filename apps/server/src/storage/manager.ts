import { StorageBackend } from "@mugiwara-manga/plugin-api";
import { getStorageFactory } from "../plugins/registry";
import * as schema from "../database/schema";

export interface StorageBackendRecord {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  isDefault: boolean;
}

export class StorageManager {
  private backends: Map<string, StorageBackend> = new Map();
  private defaultBackendId: string | null = null;

  constructor(private db: any) {}

  async initialize(): Promise<void> {
    // Load all storage backends from database
    const backends = await this.db.query.storageBackends.findMany();

    for (const config of backends) {
      await this.loadBackend(config);
    }

    if (!this.defaultBackendId && backends.length > 0) {
      // Fallback to first backend if no default set
      this.defaultBackendId = backends[0].id;
    }
  }

  async shutdown(): Promise<void> {
    // Shutdown all backends
    for (const backend of this.backends.values()) {
      await backend.shutdown();
    }
    this.backends.clear();
  }

  private async loadBackend(config: StorageBackendRecord): Promise<void> {
    const factory = getStorageFactory(config.type);
    if (!factory) {
      console.error(`Unknown storage backend type: ${config.type}`);
      return;
    }

    const backend = factory({ config: config.config });
    await backend.initialize(config.config);

    this.backends.set(config.id, backend);

    if (config.isDefault) {
      this.defaultBackendId = config.id;
    }
  }

  getBackend(id: string): StorageBackend | undefined {
    return this.backends.get(id);
  }

  getDefaultBackend(): StorageBackend | undefined {
    if (!this.defaultBackendId) return undefined;
    return this.backends.get(this.defaultBackendId);
  }

  getDefaultBackendId(): string | null {
    return this.defaultBackendId;
  }

  async createBackend(
    config: Omit<StorageBackendRecord, "id"> & { id?: string },
  ): Promise<string> {
    const id = config.id || `storage-${Date.now()}`;

    // If this is the first backend or marked as default, update others
    if (config.isDefault || this.backends.size === 0) {
      await this.db
        .update(schema.storageBackends)
        .set({ isDefault: false })
        .where(eq(schema.storageBackends.isDefault, true));

      this.defaultBackendId = id;
    }

    // Insert into database
    await this.db.insert(schema.storageBackends).values({
      id,
      name: config.name,
      type: config.type,
      config: JSON.stringify(config.config),
      isDefault: config.isDefault || this.backends.size === 0,
    });

    // Load and initialize
    await this.loadBackend({ ...config, id });

    return id;
  }

  async updateBackend(
    id: string,
    updates: Partial<StorageBackendRecord>,
  ): Promise<void> {
    const backend = this.backends.get(id);
    if (!backend) {
      throw new Error(`Storage backend not found: ${id}`);
    }

    // Shutdown old backend
    await backend.shutdown();
    this.backends.delete(id);

    // Update database
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.config !== undefined)
      dbUpdates.config = JSON.stringify(updates.config);
    if (updates.isDefault !== undefined) {
      dbUpdates.isDefault = updates.isDefault;
      if (updates.isDefault) {
        // Unset other defaults
        await this.db
          .update(schema.storageBackends)
          .set({ isDefault: false })
          .where(eq(schema.storageBackends.isDefault, true));
        this.defaultBackendId = id;
      }
    }

    await this.db
      .update(schema.storageBackends)
      .set(dbUpdates)
      .where(eq(schema.storageBackends.id, id));

    // Reload with new config
    const newConfig = await this.db.query.storageBackends.findFirst({
      where: eq(schema.storageBackends.id, id),
    });

    if (newConfig) {
      await this.loadBackend(newConfig);
    }
  }

  async deleteBackend(id: string): Promise<void> {
    if (this.backends.size <= 1) {
      throw new Error("Cannot delete the last storage backend");
    }

    const backend = this.backends.get(id);
    if (!backend) {
      throw new Error(`Storage backend not found: ${id}`);
    }

    // Check if any manga use this backend
    const mangaCount = await this.db.query.manga.findMany({
      where: eq(schema.manga.storageBackendId, id),
    });

    if (mangaCount.length > 0) {
      throw new Error(
        `Cannot delete backend: ${mangaCount.length} manga are using it. Migrate them first.`,
      );
    }

    // Shutdown and remove
    await backend.shutdown();
    this.backends.delete(id);

    // Remove from database
    await this.db
      .delete(schema.storageBackends)
      .where(eq(schema.storageBackends.id, id));

    // Update default if needed
    if (this.defaultBackendId === id) {
      const remaining = await this.db.query.storageBackends.findMany({
        limit: 1,
      });
      if (remaining.length > 0) {
        this.defaultBackendId = remaining[0].id;
        await this.db
          .update(schema.storageBackends)
          .set({ isDefault: true })
          .where(eq(schema.storageBackends.id, remaining[0].id));
      }
    }
  }

  async getBackendForManga(mangaId: string): Promise<StorageBackend> {
    const manga = await this.db.query.manga.findFirst({
      where: eq(schema.manga.id, mangaId),
      columns: { storageBackendId: true },
    });

    if (!manga || !manga.storageBackendId) {
      // Return default
      const defaultBackend = this.getDefaultBackend();
      if (!defaultBackend) {
        throw new Error("No storage backend available");
      }
      return defaultBackend;
    }

    const backend = this.backends.get(manga.storageBackendId);
    if (!backend) {
      throw new Error(`Storage backend not found: ${manga.storageBackendId}`);
    }

    return backend;
  }

  async setBackendForManga(mangaId: string, backendId: string): Promise<void> {
    const backend = this.backends.get(backendId);
    if (!backend) {
      throw new Error(`Storage backend not found: ${backendId}`);
    }

    await this.db
      .update(schema.manga)
      .set({ storageBackendId: backendId })
      .where(eq(schema.manga.id, mangaId));
  }

  async listBackends(): Promise<StorageBackendRecord[]> {
    // Fetch from database to get full config
    const records = await this.db.query.storageBackends.findMany();

    return records.map((record: any) => ({
      id: record.id,
      name: record.name,
      type: record.type,
      config:
        typeof record.config === "string"
          ? JSON.parse(record.config)
          : record.config,
      isDefault: record.isDefault,
    }));
  }
}

// Import eq helper
import { eq } from "drizzle-orm";
