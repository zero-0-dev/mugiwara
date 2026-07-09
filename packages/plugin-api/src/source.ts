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

  /**
   * Optional: Check for new chapters since last check.
   *
   * @remarks
   * The default implementation calls `getMangaDetails()` and filters
   * chapters with a `sortOrder` greater than that of `lastChapterId`.
   *
   * Sources that override this method MUST:
   * - Return chapters sorted **oldest-first** (ascending `sortOrder`).
   * - Return **only** chapters newer than `lastChapterId`.
   * - Use the same `chapterId` format as `getMangaDetails()`.
   * - Handle pagination internally (return ALL new chapters, not just
   *   the first page).
   */
  async checkForUpdates(
    sourceMangaId: string,
    lastChapterId?: string,
  ): Promise<SourceManga["chapters"]> {
    const manga = await this.getMangaDetails(sourceMangaId);
    if (!lastChapterId) {
      return manga.chapters;
    }

    const lastChapter = manga.chapters.find(
      (c) => c.chapterId === lastChapterId,
    );
    if (!lastChapter) {
      return manga.chapters;
    }

    return manga.chapters.filter((c) => c.sortOrder > lastChapter.sortOrder);
  }
}

export { PluginMetadata, PluginConfig, SearchResult, SourceManga, PageData };
