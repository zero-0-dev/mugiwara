import {
  BaseStorage,
  PluginMetadata,
  PluginConfig,
  MangaStorageUsage,
} from "@mugiwara-manga/plugin-api";
import * as fs from "fs/promises";
import { Dirent } from "fs";
import * as path from "path";

interface LocalStorageConfig {
  basePath: string;
}

class LocalStorage extends BaseStorage {
  readonly metadata: PluginMetadata = {
    id: "local",
    name: "Local Storage",
    version: "1.0.0",
    type: "storage",
    description: "Stores manga on local filesystem",
    compatibleCore: "^1.0.0",
  };

  private config!: LocalStorageConfig;

  async initialize(config: PluginConfig): Promise<void> {
    this.config = {
      basePath: config.basePath || "./data/manga",
    };

    // Ensure base directory exists
    await fs.mkdir(this.config.basePath, { recursive: true });
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up for local filesystem
  }

  private getMangaPath(mangaId: string): string {
    return path.join(this.config.basePath, mangaId);
  }

  private getChapterPath(mangaId: string, chapterId: string): string {
    return path.join(this.getMangaPath(mangaId), "chapters", chapterId);
  }

  private getPagePath(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
  ): string {
    return path.join(
      this.getChapterPath(mangaId, chapterId),
      this.formatPageFilename(pageNumber),
    );
  }

  private formatPageFilename(pageNumber: number): string {
    // Format: 001.jpg, 002.png, etc.
    return `${String(pageNumber).padStart(3, "0")}.jpg`;
  }

  private getExtensionFromContentType(
    contentType: string,
    _pageNumber?: number,
  ): string {
    switch (contentType) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      case "image/gif":
        return ".gif";
      case "application/zip":
        // For CBZ/ZIP files, use .cbz extension
        return ".cbz";
      case "application/x-rar-compressed":
        // For CBR/RAR files, use .cbr extension
        return ".cbr";
      default:
        return ".bin";
    }
  }

  async writeChapterPage(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
    data: Buffer,
    contentType: string,
  ): Promise<void> {
    const chapterPath = this.getChapterPath(mangaId, chapterId);
    await fs.mkdir(chapterPath, { recursive: true });

    const extension = this.getExtensionFromContentType(contentType);
    const filename = `${String(pageNumber).padStart(3, "0")}${extension}`;
    const pagePath = path.join(chapterPath, filename);

    // Write to a hidden temp file and rename it into place so an interrupted
    // write can never leave a partial page behind.
    const tempPath = path.join(
      chapterPath,
      `.${filename}.${process.pid}.${Date.now()}.tmp`,
    );

    try {
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, pagePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }

    // Compression can change a page's content type/extension on re-download.
    // Remove stale copies of this page that used a different extension so the
    // page count and served bytes stay consistent.
    try {
      const pagePrefix = `${String(pageNumber).padStart(3, "0")}.`;
      const files = await fs.readdir(chapterPath);
      await Promise.all(
        files
          .filter(
            (file) =>
              file !== filename &&
              file.startsWith(pagePrefix) &&
              !file.startsWith(".") &&
              path.extname(file) !== ".tmp",
          )
          .map((file) => fs.rm(path.join(chapterPath, file), { force: true })),
      );
    } catch {
      // Cleanup is best-effort; the new page was already written.
    }
  }

  async readChapterPage(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
  ): Promise<Buffer> {
    const chapterPath = this.getChapterPath(mangaId, chapterId);

    // Try to find the page file with any extension
    const files = await fs.readdir(chapterPath);
    const pageFilename = String(pageNumber).padStart(3, "0");
    const pageFile = files.find((f: string) => f.startsWith(pageFilename));

    if (!pageFile) {
      throw new Error(`Page ${pageNumber} not found for chapter ${chapterId}`);
    }

    const pagePath = path.join(chapterPath, pageFile);
    return fs.readFile(pagePath);
  }

  async listChapterPages(mangaId: string, chapterId: string): Promise<number> {
    try {
      const chapterPath = this.getChapterPath(mangaId, chapterId);
      const files = await fs.readdir(chapterPath);

      // Count files that match the page pattern (###.*)
      const pageFiles = files.filter((f: string) => /^\d{3}\./.test(f));
      return pageFiles.length;
    } catch {
      // Chapter directory doesn't exist
      return 0;
    }
  }

  getPageUrl(mangaId: string, chapterId: string, pageNumber: number): string {
    // Return API endpoint URL - the server will handle serving the file
    return `/api/content/manga/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}/pages/${pageNumber}`;
  }

  // Disk usage from filesystem metadata. Archives count as a single file and
  // directory chapters count as the sum of their page files, so nothing is
  // read into memory just to measure it.
  async getChapterSize(mangaId: string, chapterId: string): Promise<number> {
    const usage = await this.getChapterUsage(mangaId, chapterId);
    return usage.bytes;
  }

  async getMangaUsage(
    mangaId: string,
    chapterIds?: string[],
  ): Promise<MangaStorageUsage> {
    // A manga is a directory: <basePath>/<mangaId>. Listing its chapters folder
    // once is enough to avoid one readdir per chapter.
    const ids = chapterIds ?? (await this.listMangaChapters(mangaId));
    const chapters = await Promise.all(
      ids.map(async (chapterId) => {
        const usage = await this.getChapterUsage(mangaId, chapterId);
        return { chapterId, bytes: usage.bytes, exists: usage.exists };
      }),
    );

    return {
      mangaId,
      totalBytes: chapters.reduce((sum, chapter) => sum + chapter.bytes, 0),
      chapters,
    };
  }

  private async getChapterUsage(
    mangaId: string,
    chapterId: string,
  ): Promise<{ bytes: number; exists: boolean }> {
    const chapterPath = this.getChapterPath(mangaId, chapterId);
    let entries: Dirent[];

    try {
      entries = await fs.readdir(chapterPath, { withFileTypes: true });
    } catch {
      // Missing chapters are normal on an idempotent delete path.
      return { bytes: 0, exists: false };
    }

    let bytes = 0;
    let exists = false;

    for (const entry of entries) {
      // Temporary files from an interrupted write are not part of a chapter.
      if (entry.name.startsWith(".") || entry.name.endsWith(".tmp")) continue;

      const entryPath = path.join(chapterPath, entry.name);
      try {
        const stat = await fs.stat(entryPath);
        // An archive is a single file; a directory chapter contributes every
        // image file inside it.
        bytes += stat.isDirectory()
          ? await this.getDirectorySize(entryPath)
          : stat.size;
        exists = true;
      } catch {
        // A file can disappear between readdir and stat; ignore it.
      }
    }

    return { bytes, exists };
  }

  private async getDirectorySize(directoryPath: string): Promise<number> {
    let bytes = 0;
    let entries: Dirent[];

    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true });
    } catch {
      return 0;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.endsWith(".tmp")) continue;
      const entryPath = path.join(directoryPath, entry.name);
      try {
        const stat = await fs.stat(entryPath);
        bytes += stat.isDirectory()
          ? await this.getDirectorySize(entryPath)
          : stat.size;
      } catch {
        // Ignore files that vanish mid-scan.
      }
    }

    return bytes;
  }

  async deleteChapter(mangaId: string, chapterId: string): Promise<void> {
    const chapterPath = this.getChapterPath(mangaId, chapterId);
    // `force: true` keeps deletion idempotent when the chapter is already
    // gone, but real filesystem failures (permissions, I/O, a corrupt layout)
    // must propagate. The disk-space manager relies on the rejection to keep
    // the chapter marked as downloaded instead of claiming files were freed.
    await fs.rm(chapterPath, { recursive: true, force: true });
  }

  async deleteManga(mangaId: string): Promise<void> {
    const mangaPath = this.getMangaPath(mangaId);
    try {
      await fs.rm(mangaPath, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  }

  protected async listMangaChapters(mangaId: string): Promise<string[]> {
    try {
      const chaptersPath = path.join(this.getMangaPath(mangaId), "chapters");
      const entries = await fs.readdir(chaptersPath, { withFileTypes: true });
      return entries
        .filter((entry: Dirent) => entry.isDirectory())
        .map((entry: Dirent) => entry.name);
    } catch {
      return [];
    }
  }

  // Helper method to get the actual file path for a page (used by server to serve files)
  async getPageFilePath(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
  ): Promise<string | null> {
    try {
      const chapterPath = this.getChapterPath(mangaId, chapterId);
      const files = await fs.readdir(chapterPath);

      // First, check for archive files (CBZ/CBR) - these contain multiple pages
      const archiveFile = files.find(
        (f: string) =>
          f.endsWith(".cbz") ||
          f.endsWith(".zip") ||
          f.endsWith(".cbr") ||
          f.endsWith(".rar"),
      );
      if (archiveFile) {
        return path.join(chapterPath, archiveFile);
      }

      // Otherwise, look for individual image files
      const pageFilename = String(pageNumber).padStart(3, "0");
      const pageFile = files.find((f: string) => f.startsWith(pageFilename));

      if (!pageFile) {
        return null;
      }

      return path.join(chapterPath, pageFile);
    } catch {
      return null;
    }
  }

  // Scan storage for manga that exist in storage but not in the database
  async scan(): Promise<
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
  > {
    const results: Array<{
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
    }> = [];

    try {
      // Scan the base path for manga folders
      const entries = await fs.readdir(this.config.basePath, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const mangaPath = path.join(this.config.basePath, entry.name);
        const title = entry.name;

        // Check if this folder has chapters
        const chapters = await this.scanChapters(mangaPath);
        if (chapters.length === 0) continue;

        // Find cover image
        const coverImage = await this.findCoverImage(mangaPath);

        results.push({
          sourceMangaId: mangaPath,
          title,
          coverImageUrl: coverImage ? `file://${coverImage}` : undefined,
          chapters,
        });
      }
    } catch (error) {
      console.error(
        `Error scanning storage at ${this.config.basePath}:`,
        error,
      );
    }

    return results;
  }

  private async scanChapters(mangaPath: string): Promise<
    Array<{
      sourceChapterId: string;
      chapterId: string;
      title?: string;
      sortOrder: number;
      pageCount?: number;
    }>
  > {
    const chapters: Array<{
      sourceChapterId: string;
      chapterId: string;
      title?: string;
      sortOrder: number;
      pageCount?: number;
    }> = [];

    try {
      const chaptersPath = path.join(mangaPath, "chapters");
      const entries = await fs.readdir(chaptersPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(chaptersPath, entry.name);

        if (entry.isDirectory()) {
          // Check if directory contains images
          const hasImages = await this.hasImageFiles(entryPath);
          if (hasImages) {
            const chapterId = this.extractChapterNumber(entry.name);
            chapters.push({
              sourceChapterId: entryPath,
              chapterId,
              title: entry.name,
              sortOrder: this.chapterIdToSortOrder(chapterId),
            });
          }
        } else if (entry.isFile() && this.isArchiveFile(entry.name)) {
          // It's an archive file
          const chapterId = this.extractChapterNumber(entry.name);
          const pageCount = await this.countPagesInArchive(entryPath);
          // Remove file extension from title
          const titleWithoutExt = entry.name.replace(/\.[^/.]+$/, "");
          chapters.push({
            sourceChapterId: entryPath,
            chapterId,
            title: titleWithoutExt,
            sortOrder: this.chapterIdToSortOrder(chapterId),
            pageCount,
          });
        }
      }
    } catch {
      // Chapters directory doesn't exist or can't be read
    }

    // Sort by sortOrder
    return chapters.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async hasImageFiles(dirPath: string): Promise<boolean> {
    try {
      const files = await fs.readdir(dirPath);
      return files.some((f) => this.isImageFile(f));
    } catch {
      return false;
    }
  }

  private isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext);
  }

  private isArchiveFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return [".cbz", ".zip", ".cbr", ".rar"].includes(ext);
  }

  private extractChapterNumber(filename: string): string {
    // Remove file extension first
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    // Try to extract chapter number from filename
    // e.g., "Chapter 1" -> "1", "Vol.1 Ch.5" -> "5", "24-Bis" -> "24-Bis"
    const match = nameWithoutExt.match(
      /(?:ch(?:apter)?[.\s]*)([\d.]+(?:-[a-z]+)?)/i,
    );
    if (match) {
      return match[1];
    }

    // Try to find any number
    const numMatch = nameWithoutExt.match(/(\d+(?:\.\d+)?(?:-[a-z]+)?)/i);
    if (numMatch) {
      return numMatch[1];
    }

    // Return filename as-is if no number found
    return nameWithoutExt;
  }

  private chapterIdToSortOrder(chapterId: string): number {
    // Convert chapter ID to sortable number
    // e.g., "1" -> 1000, "1.5" -> 1500, "24-Bis" -> 24001
    const match = chapterId.match(/^(\d+)(?:\.(\d+))?/);
    if (match) {
      const base = parseInt(match[1]) * 1000;
      const decimal = match[2] ? parseInt(match[2]) : 0;
      return base + decimal;
    }
    // Non-numeric chapters go to end
    return 999999;
  }

  private async countPagesInArchive(archivePath: string): Promise<number> {
    try {
      const yauzl = await import("yauzl");
      return new Promise((resolve, reject) => {
        let count = 0;
        yauzl.open(
          archivePath,
          { lazyEntries: true },
          (err: any, zipfile: any) => {
            if (err) {
              reject(err);
              return;
            }

            zipfile.readEntry();
            zipfile.on("entry", (entry: any) => {
              const ext = entry.fileName
                .toLowerCase()
                .slice(entry.fileName.lastIndexOf("."));
              if (
                [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext)
              ) {
                count++;
              }
              zipfile.readEntry();
            });

            zipfile.on("end", () => {
              resolve(count);
            });

            zipfile.on("error", reject);
          },
        );
      });
    } catch {
      // If we can't read the archive, return 0
      return 0;
    }
  }

  private async findCoverImage(mangaPath: string): Promise<string | undefined> {
    try {
      const entries = await fs.readdir(mangaPath);

      // Look for cover.* or poster.*
      for (const entry of entries) {
        const lower = entry.toLowerCase();
        if (lower.startsWith("cover.") || lower.startsWith("poster.")) {
          if (this.isImageFile(entry)) {
            return path.join(mangaPath, entry);
          }
        }
      }

      // Otherwise, look in first chapter/directory
      const dirs = entries.filter((e) => !e.includes("."));
      if (dirs.length > 0) {
        const firstDir = path.join(mangaPath, dirs[0]);
        try {
          const stat = await fs.stat(firstDir);
          if (stat.isDirectory()) {
            const images = await fs.readdir(firstDir);
            const firstImage = images.find((f) => this.isImageFile(f));
            if (firstImage) {
              return path.join(firstDir, firstImage);
            }
          }
        } catch {
          // Ignore errors
        }
      }

      // Look for any image file in manga root
      for (const entry of entries) {
        if (this.isImageFile(entry)) {
          return path.join(mangaPath, entry);
        }
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }
}

// Factory function - default export
export default function createLocalStorage(_options: {
  config: PluginConfig;
}): LocalStorage {
  return new LocalStorage();
}

export { LocalStorage };
