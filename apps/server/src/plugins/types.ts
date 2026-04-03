import {
  MangaSource,
  StorageBackend,
  PluginMetadata,
} from "@mugiwara/plugin-api";

export interface InstalledPluginRecord {
  id: string; // npm package name
  type: "source" | "storage";
  version: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  config: Record<string, any>;
  installedAt: string;
  updatedAt: string;
}

export interface PluginPackageInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
  mugiwara?: {
    type: "source" | "storage";
    id: string;
    compatibleCore: string;
  };
}

export interface LoadedPlugin {
  record: InstalledPluginRecord;
  instance: MangaSource | StorageBackend;
  metadata: PluginMetadata;
}

export interface PluginManagerOptions {
  dataDir: string;
  db: any;
}
