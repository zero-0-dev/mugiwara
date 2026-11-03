import {
  BaseSource,
  PluginMetadata,
  PluginConfig,
  SearchResult,
  SourceManga,
  PageData,
} from "@mugiwara-manga/plugin-api";
import * as fs from "fs/promises";
import * as path from "path";

interface LocalSourceConfig {
  directories?: string[];
}

interface LocalMangaInfo {
  path: string;
  title: string;
  coverImage?: string;
  chapters: LocalChapterInfo[];
}

interface LocalChapterInfo {
  path: string;
  chapterId: string;
  title?: string;
  isArchive: boolean;
  pageCount?: number;
  sortOrder: number;
}

class LocalSource extends BaseSource {
  readonly metadata: PluginMetadata = {
    id: "local",
    name: "Local Files",
    version: "1.0.0",
    type: "source",
    description: "Import manga from local directories",
    compatibleCore: "^1.0.0",
  };

  private config: LocalSourceConfig = {};

  async initialize(config: PluginConfig): Promise<void> {
    this.config = {
      directories: config.directories || [],
    };
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }

  async search(query: string, _page?: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Check if query is a valid directory path (for folder picker)
    if (query) {
      try {
        const stats = await fs.stat(query);
        if (stats.isDirectory()) {
          // Query is a directory - scan it directly for manga
          return this.scanDirectoryForManga(query);
        }
      } catch {
        // Not a valid path, treat as search term in configured directories
      }
    }

    // Search in configured directories
    for (const dir of this.config.directories || []) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const title = entry.name;
          if (query && !title.toLowerCase().includes(query.toLowerCase())) {
            continue;
          }

          const mangaPath = path.join(dir, entry.name);
          const coverImage = await this.findCoverImage(mangaPath);

          results.push({
            sourceMangaId: mangaPath,
            title,
            coverImageUrl: coverImage ? `file://${coverImage}` : undefined,
          });
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    }

    return results;
  }

  private async scanDirectoryForManga(
    dirPath: string,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      // First, check if the selected folder itself is a manga (contains chapters directly)
      const isMangaItself = await this.hasChapters(dirPath);
      if (isMangaItself) {
        const title = path.basename(dirPath);
        const coverImage = await this.findCoverImage(dirPath);
        results.push({
          sourceMangaId: dirPath,
          title,
          coverImageUrl: coverImage ? `file://${coverImage}` : undefined,
        });
        return results;
      }

      // Otherwise, scan subdirectories for manga
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const mangaPath = path.join(dirPath, entry.name);
        const title = entry.name;

        // Check if directory contains chapters (subdirectories, images, or archives)
        const hasChapters = await this.hasChapters(mangaPath);
        if (!hasChapters) {
          console.log(`Skipping ${title}: no chapters detected`);
          continue;
        }

        const coverImage = await this.findCoverImage(mangaPath);

        results.push({
          sourceMangaId: mangaPath,
          title,
          coverImageUrl: coverImage ? `file://${coverImage}` : undefined,
        });
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return results;
  }

  private async hasChapters(mangaPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(mangaPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if subdirectory contains images (chapter folder)
          const subPath = path.join(mangaPath, entry.name);
          const hasImages = await this.hasImageFiles(subPath);
          if (hasImages) {
            return true;
          }
        } else if (this.isArchiveFile(entry.name)) {
          // Archive file (CBZ, ZIP, etc.)
          return true;
        } else if (
          this.isImageFile(entry.name) &&
          !this.isCoverImage(entry.name)
        ) {
          // Direct page image in manga folder (flat structure). Cover files
          // alone do not make a folder a manga.
          return true;
        }
      }
    } catch (error) {
      console.error(`Error checking chapters in ${mangaPath}:`, error);
      return false;
    }
    return false;
  }

  async getMangaDetails(sourceMangaId: string): Promise<SourceManga> {
    const mangaPath = sourceMangaId;
    const title = path.basename(mangaPath);

    // Scan for chapters
    const chapters = await this.scanChapters(mangaPath);

    // Find cover image
    const coverImage = await this.findCoverImage(mangaPath);

    return {
      sourceMangaId,
      title,
      coverImageUrl: coverImage ? `file://${coverImage}` : undefined,
      chapters: chapters.map((ch) => ({
        sourceChapterId: ch.path,
        chapterId: ch.chapterId,
        title: ch.title,
        sortOrder: ch.sortOrder,
        pageCount: ch.pageCount,
      })),
    };
  }

  async *downloadChapter(
    sourceChapterId: string,
    _signal?: AbortSignal,
  ): AsyncGenerator<PageData, void, unknown> {
    const chapterPath = sourceChapterId;

    // Check if it's an archive file
    if (this.isArchiveFile(chapterPath)) {
      // For CBZ/ZIP/CBR files, we read the entire file as-is
      // The reader will handle extracting images on-the-fly
      const data = await fs.readFile(chapterPath);
      const contentType = this.getContentType(chapterPath);

      yield {
        pageNumber: 1,
        data,
        contentType,
      };
    } else {
      // It's a directory of images
      yield* this.readFromDirectory(chapterPath);
    }
  }

  private async scanChapters(mangaPath: string): Promise<LocalChapterInfo[]> {
    const chapters: LocalChapterInfo[] = [];

    try {
      const entries = await fs.readdir(mangaPath, { withFileTypes: true });

      // Check for flat structure (page images directly in manga folder).
      // A cover/poster file is metadata, not a chapter, and chapter
      // subdirectories take precedence over flat images.
      const hasDirectImages = entries.some(
        (entry) =>
          entry.isFile() &&
          this.isImageFile(entry.name) &&
          !this.isCoverImage(entry.name),
      );
      const hasChapterDirectories = (
        await Promise.all(
          entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => this.hasImageFiles(path.join(mangaPath, entry.name))),
        )
      ).some(Boolean);

      if (hasDirectImages && !hasChapterDirectories) {
        // Flat structure - create a single chapter for all images in the folder
        chapters.push({
          path: mangaPath,
          chapterId: "1",
          title: "Chapter 1",
          isArchive: false,
          sortOrder: 1000,
        });
        return chapters;
      }

      for (const entry of entries) {
        const entryPath = path.join(mangaPath, entry.name);

        if (entry.isDirectory()) {
          // Check if directory contains images
          const hasImages = await this.hasImageFiles(entryPath);
          if (hasImages) {
            const chapterId = this.extractChapterNumber(entry.name);
            chapters.push({
              path: entryPath,
              chapterId,
              title: entry.name,
              isArchive: false,
              sortOrder: this.chapterIdToSortOrder(chapterId),
            });
          }
        } else if (entry.isFile() && this.isArchiveFile(entry.name)) {
          // It's an archive file - count pages inside
          const chapterId = this.extractChapterNumber(entry.name);
          const pageCount = await this.countPagesInArchive(entryPath);
          // Remove file extension from title
          const titleWithoutExt = entry.name.replace(/\.[^/.]+$/, "");
          chapters.push({
            path: entryPath,
            chapterId,
            title: titleWithoutExt,
            isArchive: true,
            pageCount,
            sortOrder: this.chapterIdToSortOrder(chapterId),
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning chapters in ${mangaPath}:`, error);
    }

    // Sort by sortOrder
    return chapters.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private async *readFromDirectory(
    dirPath: string,
  ): AsyncGenerator<PageData, void, unknown> {
    const files = await fs.readdir(dirPath);
    const imageFiles = files
      .filter((f) => this.isImageFile(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (let i = 0; i < imageFiles.length; i++) {
      const filePath = path.join(dirPath, imageFiles[i]);
      const data = await fs.readFile(filePath);
      const contentType = this.getContentType(filePath);

      yield {
        pageNumber: i + 1,
        data,
        contentType,
      };
    }
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
        const stat = await fs.stat(firstDir);
        if (stat.isDirectory()) {
          const images = await fs.readdir(firstDir);
          const firstImage = images.find((f) => this.isImageFile(f));
          if (firstImage) {
            return path.join(firstDir, firstImage);
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return undefined;
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
    return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(ext);
  }

  private isCoverImage(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.startsWith("cover.") || lower.startsWith("poster.");
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

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".png":
        return "image/png";
      case ".gif":
        return "image/gif";
      case ".webp":
        return "image/webp";
      case ".bmp":
        return "image/bmp";
      case ".cbz":
      case ".zip":
        return "application/zip";
      case ".cbr":
      case ".rar":
        return "application/x-rar-compressed";
      default:
        return "application/octet-stream";
    }
  }
}

// Factory function
export default function createLocalSource(options: {
  config: PluginConfig;
}): LocalSource {
  return new LocalSource();
}

export { LocalSource };
export type { LocalSourceConfig };
