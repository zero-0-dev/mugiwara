import createLocalStorage from "@mugiwara-manga/storage-local";
import { registerStorageBackend } from "./registry";
import { PluginConfig } from "@mugiwara-manga/plugin-api";

// Register built-in storage backends
export function registerBuiltInStorageBackends(): void {
  registerStorageBackend("local", (config: PluginConfig) =>
    createLocalStorage({ config }),
  );
}
