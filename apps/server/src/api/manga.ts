import { Router, Request, Response } from "express";
import { mangaRepository, progressRepository } from "../database";
import { v4 as uuidv4 } from "uuid";

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
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting manga:", error);
    res.status(500).json({ error: "Failed to delete manga" });
  }
});

// GET /api/manga/:id/progress - Get reading progress
router.get(
  "/:id/progress",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "ID is required" });
        return;
      }
      const progress = await progressRepository.findByMangaId(id);
      // Return null if no progress found (user hasn't started reading yet)
      res.json(progress || null);
    } catch (error) {
      console.error("Error fetching progress:", error);
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  },
);

// POST /api/manga/:id/progress - Update reading progress
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
      const { chapterId, pageNumber, totalPages, isCompleted, deviceId } =
        req.body;

      const percentComplete =
        totalPages > 0 ? (pageNumber / totalPages) * 100 : 0;

      const progress = await progressRepository.upsert({
        id: uuidv4(),
        mangaId: id,
        chapterId,
        pageNumber,
        totalPages,
        percentComplete,
        isCompleted: isCompleted || percentComplete >= 95,
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
