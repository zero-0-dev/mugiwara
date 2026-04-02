import { Router, Request, Response } from "express";
import { chapterRepository, mangaRepository } from "../database";
import { pluginManager } from "../plugins";

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
router.get("/:chapterId", async (req: Request, res: Response): Promise<void> => {
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
});

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

      // Get the chapter to retrieve its file path
      const chapter = await chapterRepository.findById(chapterId);
      if (!chapter) {
        res.status(404).json({ error: "Chapter not found" });
        return;
      }

      const source = pluginManager.getSource(manga.sourceId);
      if (!source) {
        res.status(400).json({ error: "Source not found" });
        return;
      }

      // Pass the file path, not the chapter UUID
      const pages = await source.getChapterPages(mangaId, chapter.filePath);
      res.json(pages);
    } catch (error) {
      console.error("Error fetching pages:", error);
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  },
);

export default router;
