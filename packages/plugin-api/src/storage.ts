import {
  PluginMetadata,
  PluginConfig,
  PageExport,
  MangaStorageUsage,
} from "./types";

export abstract class BaseStorage {
  abstract readonly metadata: PluginMetadata;

  // Called once on server startup
  abstract initialize(config: PluginConfig): Promise<void>;

  // Called on server shutdown
  abstract shutdown(): Promise<void>;

  // Write a single page to storage
  // Backend decides internal organization
  abstract writeChapterPage(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
    data: Buffer,
    contentType: string,
  ): Promise<void>;

  // Read a single page from storage
  abstract readChapterPage(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
  ): Promise<Buffer>;

  // List all pages in a chapter, returns page count
  // Pages should be numbered 1 to N
  abstract listChapterPages(
    mangaId: string,
    chapterId: string,
  ): Promise<number>;

  // Get a URL for serving the page via HTTP
  // This could be a file:// URL for local, or a presigned S3 URL, etc.
  abstract getPageUrl(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
  ): string;

  // Bytes stored for a single chapter.
  //
  // The default implementation lists and reads every page. That works for any
  // backend that implements the abstract storage methods, but backends with
  // native metadata (filesystem stat, object listing, ...) should override it
  // so disk-usage screens do not have to download page contents.
  async getChapterSize(mangaId: string, chapterId: string): Promise<number> {
    const pageCount = await this.listChapterPages(mangaId, chapterId);
    let totalBytes = 0;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const data = await this.readChapterPage(mangaId, chapterId, pageNumber);
      totalBytes += data.byteLength;
    }

    return totalBytes;
  }

  // Bulk variant used by the disk-space manager. The default implementation
  // delegates to getChapterSize so it stays correct for every backend.
  async getMangaUsage(
    mangaId: string,
    chapterIds?: string[],
  ): Promise<MangaStorageUsage> {
    const ids = chapterIds ?? (await this.listMangaChapters(mangaId));
    const chapters = await Promise.all(
      ids.map(async (chapterId) => {
        const bytes = await this.getChapterSize(mangaId, chapterId);
        return { chapterId, bytes, exists: bytes > 0 };
      }),
    );

    return {
      mangaId,
      totalBytes: chapters.reduce((sum, chapter) => sum + chapter.bytes, 0),
      chapters,
    };
  }

  // Delete a single chapter
  abstract deleteChapter(mangaId: string, chapterId: string): Promise<void>;

  // Delete an entire manga (all chapters + metadata)
  abstract deleteManga(mangaId: string): Promise<void>;

  // Optional: Export all pages of a manga for migration
  // Default implementation reads and yields all pages sequentially
  async *exportManga(
    mangaId: string,
  ): AsyncGenerator<PageExport, void, unknown> {
    const chapterIds = await this.listMangaChapters(mangaId);

    for (const chapterId of chapterIds) {
      const pageCount = await this.listChapterPages(mangaId, chapterId);

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const data = await this.readChapterPage(mangaId, chapterId, pageNum);
        // Infer content type from data (simplified - could be improved)
        const contentType = this.inferContentType(data);

        yield {
          chapterId,
          pageNumber: pageNum,
          data,
          contentType,
        };
      }
    }
  }

  // Optional: Import all pages of a manga from migration
  // Default implementation writes pages sequentially
  async importManga(
    mangaId: string,
    pages: AsyncIterable<PageExport>,
  ): Promise<void> {
    for await (const page of pages) {
      await this.writeChapterPage(
        mangaId,
        page.chapterId,
        page.pageNumber,
        page.data,
        page.contentType,
      );
    }
  }

  // Scan storage for manga that exist in storage but not in the database
  // Returns an array of manga info with chapters
  // Each manga should have a unique identifier that can be used to check if it already exists
  abstract scan(): Promise<
    Array<{
      sourceMangaId: string; // Unique identifier (e.g., folder path)
      title: string;
      coverImageUrl?: string;
      chapters: Array<{
        sourceChapterId: string; // Unique identifier (e.g., file path)
        chapterId: string;
        title?: string;
        sortOrder: number;
        pageCount?: number;
      }>;
    }>
  >;

  // Helper method - list all chapters of a manga
  // Must be implemented by subclasses
  protected abstract listMangaChapters(mangaId: string): Promise<string[]>;

  // Helper to infer content type from image buffer
  protected inferContentType(data: Buffer): string {
    // Check magic bytes
    if (data[0] === 0xff && data[1] === 0xd8) {
      return "image/jpeg";
    }
    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      return "image/png";
    }
    if (
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46
    ) {
      return "image/webp";
    }
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      return "image/gif";
    }
    return "application/octet-stream";
  }
}

export { PluginMetadata, PluginConfig, PageExport };
