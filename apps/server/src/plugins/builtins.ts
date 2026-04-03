// Register built-in plugins
import { registerSource, registerStorage } from "./registry";
import createLocalSource from "@mugiwara/source-local";
import createLocalStorage from "@mugiwara/storage-local";
import { PluginConfig } from "@mugiwara/plugin-api";

export function registerBuiltInPlugins(): void {
  // Register built-in source
  registerSource("local", (config: PluginConfig) =>
    createLocalSource({ config }),
  );

  // Register built-in storage
  registerStorage("local", (config: PluginConfig) =>
    createLocalStorage({ config }),
  );

  console.log("✅ Built-in plugins registered");
}
