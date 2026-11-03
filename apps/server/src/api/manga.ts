import { Router, Request, Response } from "express";
import {
  mangaRepository,
  progressRepository,
  chapterRepository,
} from "../database";
import { v4 as uuidv4 } from "uuid";
import { recordAudit } from "../services/audit";

const router: Router = Router();

// GET /api/manga - List all manga
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const manga = await mangaRepository.getWithProgress();
    res.json(manga);
  } catch (error) {
    console.error("Error fetching manga:", error);
    res.status(500).json({ error: "Failed to fetch manga" });
  }
});

// GET /api/manga/:id - Get manga details
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "ID is required" });
      return;
    }
    const manga = await mangaRepository.findById(id);
    if (!manga) {
      res.status(404).json({ error: "Manga not found" });
      return;
    }
    res.json(manga);
  } catch (error) {
    console.error("Error fetching manga:", error);
    res.status(500).json({ error: "Failed to fetch manga" });
  }
});

// POST /api/manga - Create manga (used by plugins)
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, sourceId, sourceMangaId, ...rest } = req.body;

    if (!title || !sourceId) {
      res.status(400).json({ error: "Title and sourceId are required" });
      return;
    }

    // Check if manga already exists
    const existing = sourceMangaId
      ? await mangaRepository.findBySource(sourceId, sourceMangaId)
      : undefined;

    if (existing) {
      res.json(existing);
      return;
    }

    const manga = await mangaRepository.create({
      id: uuidv4(),
      title,
      sourceId,
      sourceMangaId,
      ...rest,
    });

    res.status(201).json(manga);
  } catch (error) {
    console.error("Error creating manga:", error);
    res.status(500).json({ error: "Failed to create manga" });
  }
});

// PUT /api/manga/:id - Update manga
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "ID is required" });
      return;
    }
    const existing = await mangaRepository.findById(id);
    if (!existing) {
      res.status(404).json({ error: "Manga not found" });
      return;
    }

    const manga = await mangaRepository.update(id, req.body);
    res.json(manga);
  } catch (error) {
    console.error("Error updating manga:", error);
    res.status(500).json({ error: "Failed to update manga" });
  }
});

// DELETE /api/manga/:id - Delete manga
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "ID is required" });
      return;
    }

    // Get manga details before deletion to find storage backend
    const manga = await mangaRepository.findById(id);
    if (manga) {
      // Delete from storage backend first
      try {
        const storage = await global.storageManager.getBackendForManga(id);
        await storage.deleteManga(id);
        console.log(`[Delete] Removed manga ${id} from storage backend`);
      } catch (storageError) {
        console.error(
          `[Delete] Failed to remove manga ${id} from storage:`,
          storageError,
        );
        // Continue with DB deletion even if storage deletion fails
      }
    }

    await mangaRepository.delete(id);
    recordAudit({
      event: "manga.delete",
      actor: req.auth?.id ?? null,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { mangaId: id, title: manga?.title ?? null },
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting manga:", error);
    res.status(500).json({ error: "Failed to delete manga" });
  }
});

// GET /api/manga/:id/progress - Get overall manga progress
// Returns overall reading stats: total chapters, completed chapters, percentage
// For per-chapter progress, use GET /api/manga/:id/progress/all
router.get(
  "/:id/progress",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;
      const deviceId = req.query.deviceId as string | undefined;
      if (!id) {
        res.status(400).json({ error: "ID is required" });
        return;
      }

      // Get all chapters for this manga
      const chapters = await chapterRepository.findByMangaId(id);
      const totalChapters = chapters.length;

      // Get all progress for this manga
      const allProgress = deviceId
        ? await progressRepository.findAllByMangaId(id, deviceId)
        : await progressRepository.findAllByMangaId(id);

      // Count completed chapters
      const completedChapters = allProgress.filter(
        (p) => p.isCompleted || p.percentComplete >= 95,
      ).length;

      // Calculate overall percentage
      const percentComplete =
        totalChapters > 0
          ? Math.round((completedChapters / totalChapters) * 100)
          : 0;

      // Get the most recently read chapter
      const mostRecentProgress = allProgress[0];

      // Build the response
      const overallProgress = {
        id: mostRecentProgress?.id || uuidv4(),
        mangaId: id,
        chapterId: mostRecentProgress?.chapterId || null,
        pageNumber: mostRecentProgress?.pageNumber || 1,
        totalPages: mostRecentProgress?.totalPages || 0,
        percentComplete,
        isCompleted: percentComplete >= 100,
        lastReadAt: mostRecentProgress?.lastReadAt || new Date().toISOString(),
        deviceId: deviceId || mostRecentProgress?.deviceId,
        // Additional metadata for overall progress
        _overallStats: {
          totalChapters,
          completedChapters,
          inProgressChapters: allProgress.filter(
            (p) =>
              !p.isCompleted && p.percentComplete > 0 && p.percentComplete < 95,
          ).length,
        },
      };

      res.json(overallProgress);
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  },
);

// GET /api/manga/:id/progress/all - Get all chapter progress for a manga
router.get(
  "/:id/progress/all",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;
      const deviceId = req.query.deviceId as string | undefined;
      if (!id) {
        res.status(400).json({ error: "ID is required" });
        return;
      }
      const progress = await progressRepository.findAllByMangaId(id, deviceId);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching all progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  },
);

// POST /api/manga/:id/progress - Update reading progress (backward compatible)
// DEPRECATED: Use POST /api/manga/:id/chapters/:chapterId/progress for per-chapter tracking
router.post(
  "/:id/progress",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;
      console.log(`[API] Saving progress for manga ${id}:`, req.body);
      if (!id) {
        res.status(400).json({ error: "ID is required" });
        return;
      }
      const { chapterId, pageNumber, totalPages, deviceId } = req.body;

      // Use the legacy upsert for backward compatibility
      // percentComplete and isCompleted are calculated dynamically
      const progress = await progressRepository.upsertByManga({
        id: uuidv4(),
        mangaId: id,
        chapterId,
        pageNumber,
        totalPages,
        deviceId,
      });

      res.json(progress);
    } catch (error) {
      console.error("Error updating progress:", error);
      res.status(500).json({ error: "Failed to update progress" });
    }
  },
);

export default router;
