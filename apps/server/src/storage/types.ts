import { StorageBackend } from "@mugiwara/plugin-api";

export interface StorageBackendConfig {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  isDefault: boolean;
}

export interface StorageManagerOptions {
  dataDir: string;
}
