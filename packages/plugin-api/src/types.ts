// Core types shared between sources, storage backends, and the server

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  type: "source" | "storage";
  description?: string;
  author?: string;
  compatibleCore: string; // semver range, e.g., "^1.0.0"
}

export interface PluginConfig {
  [key: string]: any;
}

// Search results from a source
export interface SearchResult {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  description?: string;
  author?: string;
  artist?: string;
  status?: "ongoing" | "completed" | "hiatus" | "cancelled";
  mediaType?: "manga" | "manhwa" | "manhua" | "webtoon" | "unknown";
}

// Full manga details from a source
export interface SourceManga {
  sourceMangaId: string;
  title: string;
  altTitles?: string[];
  description?: string;
  author?: string;
  artist?: string;
  status?: "ongoing" | "completed" | "hiatus" | "cancelled";
  mediaType?: "manga" | "manhwa" | "manhua" | "webtoon" | "unknown";
  coverImageUrl?: string;
  bannerImageUrl?: string;
  genres?: string[];
  tags?: string[];
  chapters: SourceChapter[];
}

// Chapter information from a source
export interface SourceChapter {
  sourceChapterId: string;
  chapterId: string; // The chapter identifier (e.g., "1", "24-Bis", "bonus")
  title?: string;
  sortOrder: number; // For ordering chapters
  publishedAt?: string; // ISO date
  pageCount?: number; // Optional: number of pages (for archives like CBZ)
  language?: string; // Language code (e.g., "en", "jp")
  scanlationGroup?: string; // Scanlation group name (e.g., "Viz", "TCB Scans")
}

// Page data returned when downloading a chapter
export interface PageData {
  pageNumber: number;
  data: Buffer;
  contentType: string;
}

// Export format for migration between storage backends
export interface PageExport {
  chapterId: string;
  pageNumber: number;
  data: Buffer;
  contentType: string;
}

// Plugin factory options
export interface PluginOptions {
  config: PluginConfig;
}

// Source factory function type
export type SourceFactory = (options: PluginOptions) => MangaSource;

// Storage factory function type
export type StorageFactory = (options: PluginOptions) => StorageBackend;

// Import action for local sources
export type ImportAction = "copy" | "move";

// Import task information
export interface ImportTaskInfo {
  mangaId: string;
  chapterId: string;
  sourceChapterId: string;
  sortOrder: number;
}

// Plugin interfaces (re-exported from specific modules)
export interface MangaSource {
  readonly metadata: PluginMetadata;
  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;
  search(query: string, page?: number): Promise<SearchResult[]>;
  getMangaDetails(sourceMangaId: string): Promise<SourceManga>;
  downloadChapter(
    sourceChapterId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<PageData, void, unknown>;
  checkForUpdates?(
    sourceMangaId: string,
    lastChapterId?: string,
  ): Promise<SourceChapter[]>;
}

export interface StorageBackend {
  readonly metadata: PluginMetadata;
  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;
  writeChapterPage(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
    data: Buffer,
    contentType: string,
  ): Promise<void>;
  readChapterPage(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
  ): Promise<Buffer>;
  listChapterPages(mangaId: string, chapterId: string): Promise<number>;
  getPageUrl(mangaId: string, chapterId: string, pageNumber: number): string;
  deleteChapter(mangaId: string, chapterId: string): Promise<void>;
  deleteManga(mangaId: string): Promise<void>;
  exportManga?(mangaId: string): AsyncGenerator<PageExport, void, unknown>;
  importManga?(
    mangaId: string,
    pages: AsyncIterable<PageExport>,
  ): Promise<void>;
  scan?(): Promise<
    Array<{
      sourceMangaId: string;
      title: string;
      coverImageUrl?: string;
      chapters: Array<{
        sourceChapterId: string;
        chapterId: string;
        title?: string;
        sortOrder: number;
        pageCount?: number;
      }>;
    }>
  >;
}
