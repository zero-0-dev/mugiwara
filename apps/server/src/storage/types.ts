import { StorageBackend } from "@mugiwara-manga/plugin-api";

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
