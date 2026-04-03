import {
  PluginMetadata,
  PluginConfig,
  SearchResult,
  SourceManga,
  PageData,
} from "./types";

export abstract class BaseSource {
  abstract readonly metadata: PluginMetadata;

  // Called once on server startup
  abstract initialize(config: PluginConfig): Promise<void>;

  // Called on server shutdown
  abstract shutdown(): Promise<void>;

  // Search for manga by query
  abstract search(query: string, page?: number): Promise<SearchResult[]>;

  // Get full manga details including chapters
  abstract getMangaDetails(sourceMangaId: string): Promise<SourceManga>;

  // Download a chapter - yields pages as they're downloaded
  abstract downloadChapter(
    sourceChapterId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<PageData, void, unknown>;

  // Optional: Check for new chapters since last check
  // Default implementation returns empty array
  async checkForUpdates(
    sourceMangaId: string,
    lastChapterId?: string,
  ): Promise<SourceManga["chapters"]> {
    const manga = await this.getMangaDetails(sourceMangaId);
    if (!lastChapterId) {
      return manga.chapters;
    }

    // Find chapters after the last known one
    const lastIndex = manga.chapters.findIndex(
      (c) => c.chapterId === lastChapterId,
    );
    if (lastIndex === -1) {
      // Last chapter not found, return all (might be renumbered)
      return manga.chapters;
    }

    return manga.chapters.slice(lastIndex + 1);
  }
}

export { PluginMetadata, PluginConfig, SearchResult, SourceManga, PageData };
