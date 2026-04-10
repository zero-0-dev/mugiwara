import { Router, Request, Response } from "express";
import { chapterRepository, mangaRepository } from "../database";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import * as yauzl from "yauzl";

const router: Router = Router({ mergeParams: true });

// GET /api/manga/:mangaId/chapters - List chapters for manga
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const mangaId = req.params.mangaId;
    if (!mangaId) {
      res.status(400).json({ error: "Manga ID is required" });
      return;
    }
    const chapters = await chapterRepository.findByMangaId(mangaId);
    res.json(chapters);
  } catch (error) {
    console.error("Error fetching chapters:", error);
    res.status(500).json({ error: "Failed to fetch chapters" });
  }
});

// GET /api/manga/:mangaId/chapters/:chapterId - Get chapter details
router.get(
  "/:chapterId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const chapterId = req.params.chapterId;
      if (!chapterId) {
        res.status(400).json({ error: "Chapter ID is required" });
        return;
      }
      const chapter = await chapterRepository.findById(chapterId);
      if (!chapter) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }
      res.json(chapter);
    } catch (error) {
      console.error("Error fetching chapter:", error);
      res.status(500).json({ error: "Failed to fetch chapter" });
    }
  },
);

// GET /api/manga/:mangaId/chapters/:chapterId/pages - Get chapter pages
router.get(
  "/:chapterId/pages",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const mangaId = req.params.mangaId;
      const chapterId = req.params.chapterId;

      if (!mangaId || !chapterId) {
        res.status(400).json({ error: "Manga ID and Chapter ID are required" });
        return;
      }

      const manga = await mangaRepository.findById(mangaId);
      if (!manga) {
        res.status(404).json({ error: "Manga not found" });
        return;
      }

      // Get the chapter to retrieve its info
      const chapter = await chapterRepository.findById(chapterId);
      if (!chapter) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      // Get the source to download chapter pages
      const source = global.pluginManager.getSource(manga.sourceId);
      if (!source) {
        res.status(400).json({ error: "Source not found" });
        return;
      }

      // Check if chapter is already imported
      // Use pagesCount from database (for CBZ archives) or count files in storage
      const storage = await global.storageManager.getBackendForManga(mangaId);
      const storedPageCount = await storage.listChapterPages(
        mangaId,
        chapter.chapterId,
      );

      // Use the larger of: stored file count or database pagesCount
      // For CBZ files, storedPageCount will be 1 (the archive), but chapter.pagesCount has actual count
      const pageCount = Math.max(storedPageCount, chapter.pagesCount || 0);

      if (pageCount > 0) {
        // Chapter is already imported, serve from storage
        const pages: Array<{ index: number; url: string }> = [];
        for (let i = 1; i <= pageCount; i++) {
          pages.push({
            index: i - 1,
            url: storage.getPageUrl(mangaId, chapter.chapterId, i),
          });
        }
        res.json(pages);
        return;
      }

      // Chapter not imported yet, need to download from source
      if (!manga.sourceMangaId) {
        res.status(400).json({ error: "Manga source information missing" });
        return;
      }

      const mangaDetails = await source.getMangaDetails(manga.sourceMangaId);
      const sourceChapter = mangaDetails.chapters.find(
        (c) => c.chapterId === chapter.chapterId,
      );

      if (!sourceChapter) {
        res.status(404).json({ error: "Chapter not found in source" });
        return;
      }

      // Download chapter pages using the source
      const pages: Array<{ index: number; url: string }> = [];

      for await (const pageData of source.downloadChapter(
        sourceChapter.sourceChapterId,
      )) {
        // Store page in storage backend
        await storage.writeChapterPage(
          mangaId,
          chapter.chapterId,
          pageData.pageNumber,
          pageData.data,
          pageData.contentType,
        );

        pages.push({
          index: pageData.pageNumber - 1,
          url: storage.getPageUrl(
            mangaId,
            chapter.chapterId,
            pageData.pageNumber,
          ),
        });
      }

      res.json(pages);
    } catch (error) {
      console.error("Error fetching pages:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  },
);

// POST /api/manga/:mangaId/chapters/:chapterId/download - Trigger download for a chapter
router.post(
  "/:chapterId/download",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const mangaId = req.params.mangaId;
      const chapterId = req.params.chapterId;

      if (!mangaId || !chapterId) {
        res.status(400).json({ error: "Manga ID and Chapter ID are required" });
        return;
      }

      // Get manga details
      const manga = await mangaRepository.findById(mangaId);
      if (!manga) {
        res.status(404).json({ error: "Manga not found" });
        return;
      }

      // Get chapter details
      const chapters = await chapterRepository.findByMangaId(mangaId);
      const chapter = chapters.find((c: any) => c.chapterId === chapterId);
      if (!chapter) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      // Check if chapter is already downloaded or queued
      const storage = await global.storageManager.getBackendForManga(mangaId);
      const storedPageCount = await storage.listChapterPages(
        mangaId,
        chapterId,
      );
      const pageCount = Math.max(storedPageCount, chapter.pagesCount || 0);

      // Check if there's already a pending or running task for this chapter
      const existingTask = await global.taskRepository.getByChapter(
        mangaId,
        chapterId,
      );
      if (
        existingTask &&
        ["pending", "running"].includes(existingTask.status)
      ) {
        res.json({
          message: "Chapter is already queued for download",
          taskId: existingTask.id,
          status: existingTask.status,
        });
        return;
      }

      // Need to get source chapter info from the source
      if (!manga.sourceMangaId) {
        res.status(400).json({ error: "Manga source information missing" });
        return;
      }

      const source = global.pluginManager.getSource(manga.sourceId);
      if (!source) {
        res.status(400).json({ error: "Source not found" });
        return;
      }

      const mangaDetails = await source.getMangaDetails(manga.sourceMangaId);
      const sourceChapter = mangaDetails.chapters.find(
        (c) => c.chapterId === chapterId,
      );

      if (!sourceChapter) {
        res.status(404).json({ error: "Chapter not found in source" });
        return;
      }

      // Create import task for this chapter
      const task = await global.taskRepository.create({
        type: "chapter",
        mangaId,
        chapterId,
        sortOrder: chapter.sortOrder,
        sourceId: manga.sourceId,
        sourceChapterId: sourceChapter.sourceChapterId,
        priority: 10, // Higher priority for on-demand downloads
      });

      // Update chapter status to pending
      await chapterRepository.update(chapter.id, {
        importStatus: "pending",
      });

      res.json({
        message: "Chapter queued for download",
        taskId: task.id,
        status: task.status,
      });
    } catch (error) {
      console.error("Error queuing chapter download:", error);
      res.status(500).json({ error: "Failed to queue chapter for download" });
    }
  },
);

// GET /api/manga/:mangaId/chapters/:chapterId/pages/:pageNumber - Serve a specific page
router.get(
  "/:chapterId/pages/:pageNumber",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const mangaId = req.params.mangaId;
      const chapterId = req.params.chapterId;
      const pageNumber = req.params.pageNumber;

      if (!mangaId || !chapterId || !pageNumber) {
        res.status(400).json({
          error: "Manga ID, Chapter ID, and Page Number are required",
        });
        return;
      }

      const manga = await mangaRepository.findById(mangaId);
      if (!manga) {
        res.status(404).json({ error: "Manga not found" });
        return;
      }

      const chapter = await chapterRepository.findById(chapterId);
      if (!chapter) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      const storage = await global.storageManager.getBackendForManga(mangaId);

      // Get the file path for the page
      const filePath = await (storage as any).getPageFilePath(
        mangaId,
        chapter.chapterId,
        parseInt(pageNumber),
      );

      if (!filePath || !existsSync(filePath)) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      // Check if it's an archive file
      if (filePath.endsWith(".cbz") || filePath.endsWith(".zip")) {
        // For CBZ/ZIP files, extract and serve the specific page
        const pageIndex = parseInt(pageNumber) - 1;
        const imageBuffer = await extractImageFromArchiveByIndex(
          filePath,
          pageIndex,
        );
        if (!imageBuffer) {
          res.status(404).json({ error: "Page not found in archive" });
          return;
        }

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(imageBuffer);
      } else {
        // Regular image file
        const imageBuffer = await readFile(filePath);
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        const contentTypeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          gif: "image/gif",
        };
        const contentType = contentTypeMap[ext] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(imageBuffer);
      }
    } catch (error) {
      console.error("Error serving page:", error);
      res.status(500).json({ error: "Failed to serve page" });
    }
  },
);

function extractImageFromArchiveByIndex(
  archivePath: string,
  index: number,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err: any, zipfile: any) => {
      if (err) {
        reject(err);
        return;
      }

      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      let imageIndex = 0;

      zipfile.readEntry();
      zipfile.on("entry", (entry: any) => {
        const ext = entry.fileName
          .toLowerCase()
          .slice(entry.fileName.lastIndexOf("."));
        if (imageExtensions.includes(ext)) {
          if (imageIndex === index) {
            zipfile.openReadStream(entry, (err: any, readStream: any) => {
              if (err) {
                reject(err);
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on("data", (chunk: any) => chunks.push(chunk));
              readStream.on("end", () => {
                zipfile.close();
                resolve(Buffer.concat(chunks));
              });
            });
          } else {
            imageIndex++;
            zipfile.readEntry();
          }
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        resolve(null);
      });

      zipfile.on("error", reject);
    });
  });
}

export default router;
