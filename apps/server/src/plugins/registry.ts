import {
  MangaSource,
  StorageBackend,
  PluginConfig,
} from "@mugiwara-manga/plugin-api";

// Registry of plugin factories
type SourceFactory = (config: PluginConfig) => MangaSource;
type StorageFactory = (config: PluginConfig) => StorageBackend;

const sourceRegistry = new Map<string, SourceFactory>();
const storageRegistry = new Map<string, StorageFactory>();

export function registerSource(id: string, factory: SourceFactory): void {
  sourceRegistry.set(id, factory);
}

export function registerStorage(id: string, factory: StorageFactory): void {
  storageRegistry.set(id, factory);
}

export function getSourceFactory(id: string): SourceFactory | undefined {
  return sourceRegistry.get(id);
}

export function getStorageFactory(id: string): StorageFactory | undefined {
  return storageRegistry.get(id);
}

export function getRegisteredSourceIds(): string[] {
  return Array.from(sourceRegistry.keys());
}

export function getRegisteredStorageIds(): string[] {
  return Array.from(storageRegistry.keys());
}

export function clearRegistries(): void {
  sourceRegistry.clear();
  storageRegistry.clear();
}
