import { Router, Request, Response } from "express";
import { StorageManager } from "../storage";
import { getRegisteredStorageIds } from "../plugins/registry";
import { recordAudit } from "../services/audit";
import { getStorageUsage } from "../services/downloads";

const router: Router = Router();

// Middleware to inject storageManager
router.use((req: any, _res, next) => {
  req.storageManager = (global as any).storageManager;
  next();
});

// GET /api/storage/types - List available storage backend types
router.get("/types", async (_req: Request, res: Response) => {
  try {
    const pm = (global as any).pluginManager;
    const types = getRegisteredStorageIds().filter((id: string) =>
      pm?.getStorage(id),
    );
    res.json(types);
  } catch (error) {
    console.error("Error listing storage types:", error);
    res.status(500).json({ error: "Failed to list storage types" });
  }
});

// GET /api/storage/usage - Disk usage per library manga
router.get("/usage", async (req: Request, res: Response) => {
  try {
    const sort = req.query.sort === "lastRead" ? "lastRead" : "size";
    const order = req.query.order === "asc" ? "asc" : "desc";

    const usage = await getStorageUsage({ sort, order });
    res.json(usage);
  } catch (error) {
    console.error("Error calculating storage usage:", error);
    res.status(500).json({ error: "Failed to calculate storage usage" });
  }
});

// GET /api/storage/backends - List all storage backends
router.get("/backends", async (req: any, res: Response) => {
  try {
    const manager: StorageManager = req.storageManager;
    const backends = await manager.listBackends();
    res.json(backends);
  } catch (error) {
    console.error("Error listing storage backends:", error);
    res.status(500).json({ error: "Failed to list storage backends" });
  }
});

// POST /api/storage/backends - Create new storage backend
router.post("/backends", async (req: any, res: Response) => {
  try {
    const manager: StorageManager = req.storageManager;
    const { name, type, config, isDefault } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: "name and type are required" });
      return;
    }

    const pm = (global as any).pluginManager;
    if (!pm?.getStorage(type)) {
      res.status(400).json({
        error: `Storage type "${type}" is not available or has been disabled`,
      });
      return;
    }

    const id = await manager.createBackend({
      name,
      type,
      config: config || {},
      isDefault: isDefault || false,
    });

    res.status(201).json({ id, message: "Storage backend created" });
  } catch (error) {
    console.error("Error creating storage backend:", error);
    res.status(500).json({ error: "Failed to create storage backend" });
  }
});

// GET /api/storage/backends/:id - Get storage backend details
router.get("/backends/:id", async (req: any, res: Response) => {
  try {
    const manager: StorageManager = req.storageManager;
    const { id } = req.params;

    const backends = await manager.listBackends();
    const backend = backends.find((b: any) => b.id === id);

    if (!backend) {
      res.status(404).json({ error: "Storage backend not found" });
      return;
    }

    res.json(backend);
  } catch (error) {
    console.error("Error getting storage backend:", error);
    res.status(500).json({ error: "Failed to get storage backend" });
  }
});

// PUT /api/storage/backends/:id - Update storage backend
router.put("/backends/:id", async (req: any, res: Response) => {
  try {
    const manager: StorageManager = req.storageManager;
    const { id } = req.params;
    const { name, config, isDefault } = req.body;

    await manager.updateBackend(id, { name, config, isDefault });
    res.json({ message: "Storage backend updated" });
  } catch (error) {
    console.error("Error updating storage backend:", error);
    res.status(500).json({ error: "Failed to update storage backend" });
  }
});

// DELETE /api/storage/backends/:id - Delete storage backend
router.delete("/backends/:id", async (req: any, res: Response) => {
  try {
    const manager: StorageManager = req.storageManager;
    const { id } = req.params;

    await manager.deleteBackend(id);
    recordAudit({
      event: "storage.backend.delete",
      actor: req.auth?.id ?? null,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { backendId: id },
    });
    res.json({ message: "Storage backend deleted" });
  } catch (error) {
    console.error("Error deleting storage backend:", error);
    res.status(500).json({ error: "Failed to delete storage backend" });
  }
});

// POST /api/storage/backends/:id/migrate - Start migration to another backend
router.post("/backends/:id/migrate", async (req: any, res: Response) => {
  try {
    const { targetBackendId } = req.body;

    if (!targetBackendId) {
      res.status(400).json({ error: "targetBackendId is required" });
      return;
    }

    // TODO: Implement migration logic
    res.json({ message: "Migration started" });
  } catch (error) {
    console.error("Error starting migration:", error);
    res.status(500).json({ error: "Failed to start migration" });
  }
});

// POST /api/storage/scan - Scan storage for manga not in database
router.post("/scan", async (req: any, res: Response) => {
  try {
    const manager: StorageManager = req.storageManager;
    const { mangaRepository, chapterRepository } = await import("../database");
    const { v4: uuidv4 } = await import("uuid");

    const results = {
      added: 0,
      updated: 0,
      errors: [] as string[],
    };

    // Get all storage backends
    const backends = await manager.listBackends();

    for (const backendInfo of backends) {
      try {
        // Get the backend instance
        const backend = await manager.getBackend(backendInfo.id);
        if (!backend) {
          results.errors.push(`Backend ${backendInfo.id} not found`);
          continue;
        }

        // Check if backend supports scan
        if (typeof backend.scan !== "function") {
          console.log(`Backend ${backendInfo.id} does not support scanning`);
          continue;
        }

        // Scan the backend
        console.log(`Scanning backend: ${backendInfo.name}`);
        const scannedManga = await backend.scan();

        for (const manga of scannedManga) {
          try {
            // Check if manga already exists
            const existing = await mangaRepository.findBySource(
              backendInfo.id,
              manga.sourceMangaId,
            );

            if (existing) {
              // Update: add new chapters
              const existingChapters = await chapterRepository.findByMangaId(
                existing.id,
              );
              const existingChapterIds = new Set(
                existingChapters.map((c: any) => c.chapterId),
              );

              for (const chapter of manga.chapters) {
                if (!existingChapterIds.has(chapter.chapterId)) {
                  await chapterRepository.create({
                    id: uuidv4(),
                    mangaId: existing.id,
                    chapterId: chapter.chapterId,
                    title: chapter.title,
                    pagesCount: chapter.pageCount || 0,
                    sourcePagesCount: chapter.pageCount || 0,
                    sortOrder: chapter.sortOrder,
                    importStatus: "complete",
                  });
                  results.updated++;
                }
              }
            } else {
              // Create new manga
              const newManga = await mangaRepository.create({
                id: uuidv4(),
                title: manga.title,
                sourceId: backendInfo.id,
                sourceMangaId: manga.sourceMangaId,
                status: "ongoing",
                mediaType: "manga",
                storageBackendId: backendInfo.id,
                coverImage: manga.coverImageUrl,
              });

              if (!newManga) {
                throw new Error("Failed to create manga");
              }

              // Create chapters
              for (const chapter of manga.chapters) {
                await chapterRepository.create({
                  id: uuidv4(),
                  mangaId: newManga.id,
                  chapterId: chapter.chapterId,
                  title: chapter.title,
                  pagesCount: chapter.pageCount || 0,
                  sourcePagesCount: chapter.pageCount || 0,
                  sortOrder: chapter.sortOrder,
                  importStatus: "complete",
                });
              }

              results.added++;
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            results.errors.push(`Failed to process ${manga.title}: ${message}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(
          `Failed to scan backend ${backendInfo.name}: ${message}`,
        );
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Error scanning storage:", error);
    res.status(500).json({ error: "Failed to scan storage" });
  }
});

export default router;
