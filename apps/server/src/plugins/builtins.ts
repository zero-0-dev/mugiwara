// Register built-in plugins
import { registerSource, registerStorage } from "./registry";
import createLocalSource from "@mugiwara-manga/source-local";
import createLocalStorage from "@mugiwara-manga/storage-local";
import createMangaDexSource from "@mugiwara-manga/source-mangadex";
import { PluginConfig } from "@mugiwara-manga/plugin-api";

export function registerBuiltInPlugins(): void {
  // Register built-in source
  registerSource("local", (config: PluginConfig) =>
    createLocalSource({ config }),
  );

  // Register built-in MangaDex source
  registerSource("mangadex", (config: PluginConfig) =>
    createMangaDexSource({ config }),
  );

  // Register built-in storage
  registerStorage("local", (config: PluginConfig) =>
    createLocalStorage({ config }),
  );

  console.log("✅ Built-in plugins registered");
}
