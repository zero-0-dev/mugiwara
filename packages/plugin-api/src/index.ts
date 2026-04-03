// Main entry point for @mugiwara/plugin-api

// Types
export {
  PluginMetadata,
  PluginConfig,
  SearchResult,
  SourceManga,
  SourceChapter,
  PageData,
  PageExport,
  PluginOptions,
  SourceFactory,
  StorageFactory,
  ImportAction,
  ImportTaskInfo,
  MangaSource,
  StorageBackend,
} from "./types";

// Base classes
export { BaseSource } from "./source";
export { BaseStorage } from "./storage";
