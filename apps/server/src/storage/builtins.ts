import createLocalStorage from "@mugiwara/storage-local";
import { registerStorageBackend } from "./registry";
import { PluginConfig } from "@mugiwara/plugin-api";

// Register built-in storage backends
export function registerBuiltInStorageBackends(): void {
  registerStorageBackend("local", (config: PluginConfig) =>
    createLocalStorage({ config }),
  );
}
