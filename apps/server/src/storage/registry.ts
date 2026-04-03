import { StorageBackend, PluginConfig } from "@mugiwara/plugin-api";
import { StorageBackendConfig } from "./types";

// Registry of storage backend factories
const storageRegistry = new Map<
  string,
  (config: PluginConfig) => StorageBackend
>();

export function registerStorageBackend(
  type: string,
  factory: (config: PluginConfig) => StorageBackend,
): void {
  storageRegistry.set(type, factory);
}

export function getStorageBackendFactory(
  type: string,
): ((config: PluginConfig) => StorageBackend) | undefined {
  return storageRegistry.get(type);
}

export function getAvailableStorageTypes(): string[] {
  return Array.from(storageRegistry.keys());
}
