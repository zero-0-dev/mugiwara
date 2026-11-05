import { Router, Request, Response } from "express";
import {
  getLibraryDirectories,
  setLibraryDirectories,
} from "../services/settings";
import { scanLibrary } from "../services/library-scan";
import { LocalSource } from "@mugiwara-manga/source-local";
import { getRegisteredSourceIds } from "../plugins/registry";
import { anilistService } from "../services/anilist";
import { buildImportPlan } from "../services/import-plan";
import axios from "axios";
import { homedir } from "os";
import { isAbsolute, join, resolve } from "path";
import { writeFile, mkdir, stat } from "fs/promises";
import { v4 as uuidv4 } from "uuid";

const router: Router = Router();
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

function looksLikePath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    /^\\\\/.test(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  );
}

function resolveLocalPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return resolve(homedir(), trimmed.slice(2));
  }
  if (isAbsolute(trimmed)) return resolve(trimmed);
  return resolve(process.cwd(), trimmed);
}

async function validateLocalDirectory(rawPath: string): Promise<
  { ok: true; path: string } | { ok: false; error: string }
> {
  const resolvedPath = resolveLocalPath(rawPath);
  try {
    const info = await stat(resolvedPath);
    if (!info.isDirectory()) {
      return {
        ok: false,
        error: `"${rawPath}" is a file, not a folder. Choose a folder inside the server's filesystem.`,
      };
    }
    return { ok: true, path: resolvedPath };
  } catch {
    return {
      ok: false,
      error: `Folder not found on the server: "${rawPath}". Check the path and that the server process can read it.`,
    };
  }
}


// GET /api/library/sources - Get available manga sources
router.get("/sources", async (_req: Request, res: Response) => {
  try {
    const sourceIds = getRegisteredSourceIds();
    const sources = sourceIds.map((id) => {
      const source = global.pluginManager.getSource(id);
      return {
        id,
        name: source?.metadata.name || id,
        description: source?.metadata.description || "",
      };
    });
    res.json(sources);
  } catch (error) {
    console.error("Error listing sources:", error);
    res.status(500).json({ error: "Failed to list sources" });
  }
});

// GET /api/library/sources/:sourceId/search - Search manga in a source
router.get("/sources/:sourceId/search", async (req: Request, res: Response) => {
  try {
    const sourceId = req.params.sourceId;
    const q = req.query.q;

    if (!sourceId) {
      res.status(400).json({ error: "sourceId is required" });
      return;
    }

    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Query parameter q is required" });
      return;
    }

    const source = global.pluginManager.getSource(sourceId);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    let query = q;

    // For local files, a path-shaped query is validated before scanning. This
    // turns an unreadable folder into an actionable API error instead of an
    // empty result list.
    if (sourceId === "local" && looksLikePath(q)) {
      const validated = await validateLocalDirectory(q);
      if (!validated.ok) {
        res.status(400).json({ error: validated.error });
        return;
      }
      query = validated.path;
    }

    const results = await source.search(query);
    res.json(results);
  } catch (error) {
    console.error("Error searching manga in source:", error);
    res.status(500).json({ error: "Failed to search manga" });
  }
});

// GET /api/library/sources/:sourceId/manga/:sourceMangaId - Get manga details
router.get(
  "/sources/:sourceId/manga/:sourceMangaId",
  async (req: Request, res: Response) => {
    try {
      const sourceId = req.params.sourceId;
      const sourceMangaId = req.params.sourceMangaId;

      if (!sourceId || !sourceMangaId) {
        res
          .status(400)
          .json({ error: "sourceId and sourceMangaId are required" });
        return;
      }

      const source = global.pluginManager.getSource(sourceId);
      if (!source) {
        res.status(404).json({ error: "Source not found" });
        return;
      }

      const mangaDetails = await source.getMangaDetails(sourceMangaId);
      res.json(mangaDetails);
    } catch (error) {
      console.error("Error getting manga details:", error);
      res.status(500).json({ error: "Failed to get manga details" });
    }
  },
);

// POST /api/library/import - Import manga from source
router.post("/import", async (req: Request, res: Response) => {
  try {
    const { sourceId, sourceMangaId, chapters } = req.body;

    if (!sourceId || !sourceMangaId) {
      res
        .status(400)
        .json({ error: "sourceId and sourceMangaId are required" });
      return;
    }

    const source = global.pluginManager.getSource(sourceId);
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    // Get manga details from source
    let mangaDetails;
    try {
      mangaDetails = await source.getMangaDetails(sourceMangaId);
    } catch (error) {
      if (sourceId === "local" && looksLikePath(sourceMangaId)) {
        const validated = await validateLocalDirectory(sourceMangaId);
        if (!validated.ok) {
          res.status(400).json({ error: validated.error });
          return;
        }
        res.status(400).json({
          error:
            "No chapters were found in this folder. Add chapter subfolders, image files, or CBZ/ZIP archives, then try again.",
        });
        return;
      }
      throw error;
    }

    if (!mangaDetails.chapters || mangaDetails.chapters.length === 0) {
      res.status(400).json({
        error:
          "No chapters were found in this folder. Add chapter subfolders, image files, or CBZ/ZIP archives, then try again.",
      });
      return;
    }

    // Get default storage backend
    const defaultBackendId = global.storageManager.getDefaultBackendId();
    if (!defaultBackendId) {
      res.status(400).json({
        error:
          "No storage backend is configured. Open Settings → Storage, add or enable a backend, then import again.",
      });
      return;
    }

    // Check if manga already exists
    const { mangaRepository } = await import("../database");
    const existing = await mangaRepository.findBySource(
      sourceId,
      sourceMangaId,
    );

    let mangaId: string;
    const reusedExistingManga = Boolean(existing);
    if (existing) {
      mangaId = existing.id;
    } else {
      // Create new manga
      const newManga = await mangaRepository.create({
        id: uuidv4(),
        title: mangaDetails.title,
        sourceId,
        sourceMangaId,
        status: "ongoing",
        mediaType: "manga",
        storageBackendId: defaultBackendId,
      });
      if (!newManga) {
        res.status(500).json({ error: "Failed to create manga" });
        return;
      }
      mangaId = newManga.id;

      // Auto-fetch metadata from AniList (wait for it to complete)
      try {
        await fetchMetadataForManga(mangaId, mangaDetails.title);
      } catch (err) {
        console.error("[AutoFetch] Failed to fetch metadata:", err);
        // Continue even if metadata fetch fails
      }
    }

    // Get existing chapters and active queue tasks so a re-import reuses the
    // existing manga/chapter rows and does not enqueue duplicate work.
    const { chapterRepository } = await import("../database");
    const existingChapters = await chapterRepository.findByMangaId(mangaId);
    const activeTasks = await global.taskRepository.getByManga(mangaId);
    const activeChapterIds = new Set(
      activeTasks
        .filter(
          (task) => task.status === "pending" || task.status === "running",
        )
        .map((task) => task.chapterId)
        .filter((chapterId): chapterId is string => Boolean(chapterId)),
    );

    const selectedChapterIds = chapters
      ? new Set<string>(chapters.map((c: any) => c.chapterId))
      : null;

    const plan = buildImportPlan({
      sourceChapters: mangaDetails.chapters,
      existingChapters: existingChapters as any[],
      selectedChapterIds,
      activeChapterIds,
    });

    // Add only chapters that are not already in the library.
    let chaptersAdded = 0;
    for (const chapter of plan.chaptersToCreate) {
      try {
        await chapterRepository.create({
          id: uuidv4(),
          mangaId,
          chapterId: chapter.chapterId,
          title: chapter.title,
          pagesCount: chapter.pageCount || 0,
          sortOrder: chapter.sortOrder,
          importStatus: "pending",
        });
        chaptersAdded++;
      } catch (err: any) {
        // Log but don't fail - chapter might already exist (race condition)
        if (err.message?.includes("UNIQUE constraint failed")) {
          console.log(
            `[Import] Chapter ${chapter.chapterId} already exists, skipping`,
          );
        } else {
          console.error(
            `[Import] Failed to create chapter ${chapter.chapterId}:`,
            err,
          );
        }
      }
    }

    // A retried import may reuse chapters left as cancelled/error by an
    // earlier cancel. Mark them pending again before queueing so progress and
    // chapter status reflect the new import instead of the old terminal state.
    const existingByChapterId = new Map(
      (existingChapters as any[]).map((chapter) => [chapter.chapterId, chapter]),
    );
    for (const chapter of plan.chaptersToQueue) {
      const existingChapter = existingByChapterId.get(chapter.chapterId) as any;
      if (
        existingChapter &&
        existingChapter.importStatus !== "pending" &&
        existingChapter.importStatus !== "downloading" &&
        existingChapter.importStatus !== "complete"
      ) {
        await chapterRepository.update(existingChapter.id, {
          importStatus: "pending",
          importProgress: 0,
        });
      }
    }

    // Queue selected chapters that are not complete and have no active task.
    let chaptersQueued = 0;
    for (const chapter of plan.chaptersToQueue) {
      try {
        await global.taskRepository.create({
          type: "chapter",
          mangaId,
          chapterId: chapter.chapterId,
          sortOrder: chapter.sortOrder,
          sourceId,
          sourceChapterId: chapter.sourceChapterId,
        });
        chaptersQueued++;
      } catch (err) {
        // Log but continue with other chapters
        console.error(
          `[Import] Failed to queue chapter ${chapter.chapterId}:`,
          err,
        );
      }
    }

    res.json({
      success: true,
      mangaId,
      reusedExistingManga,
      chaptersAdded,
      chaptersQueued,
      chaptersReused: plan.uniqueChapters.length - chaptersAdded,
    });
  } catch (error) {
    console.error("Error importing manga:", error);
    res.status(500).json({ error: "Failed to import manga" });
  }
});

// GET /api/library/import/:mangaId/progress - Get live import progress
router.get(
  "/import/:mangaId/progress",
  async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      if (!mangaId) {
        res.status(400).json({ error: "mangaId is required" });
        return;
      }
      const { chapterRepository } = await import("../database");
      const chapters = await chapterRepository.findByMangaId(mangaId);

      const total = chapters.length;
      const completed = chapters.filter(
        (c: any) => c.importStatus === "complete",
      ).length;
      const errored = chapters.filter(
        (c: any) => c.importStatus === "error",
      ).length;
      const downloading = chapters.filter(
        (c: any) => c.importStatus === "downloading",
      ).length;
      const queued = chapters.filter(
        (c: any) => c.importStatus === "pending",
      ).length;
      const cancelled = chapters.filter(
        (c: any) => c.importStatus === "cancelled",
      ).length;

      let totalProgress = 0;
      for (const ch of chapters as any[]) {
        if (ch.importStatus === "complete" || ch.importStatus === "error")
          totalProgress += 100;
        else totalProgress += ch.importProgress || 0;
      }

      const overallProgress =
        total > 0 ? Math.round(totalProgress / total) : 0;
      const isComplete = completed + errored + cancelled >= total;

      const chapterList = (chapters as any[])
        .sort((a: any, b: any) => b.sortOrder - a.sortOrder)
        .map((ch: any) => ({
          chapterId: ch.chapterId,
          title: ch.title,
          sortOrder: ch.sortOrder,
          status:
            ch.importStatus === "pending" ? "queued" : ch.importStatus,
          totalPages: ch.pagesCount,
          completedPages:
            ch.pagesCount && ch.importProgress
              ? Math.round((ch.pagesCount * ch.importProgress) / 100)
              : undefined,
          errorMessage:
            ch.importStatus === "error"
              ? "Import failed"
              : ch.importStatus === "cancelled"
                ? "Cancelled by user"
                : undefined,
        }));

      res.json({
        mangaId,
        totalChapters: total,
        completedChapters: completed,
        erroredChapters: errored,
        downloadingChapters: downloading,
        queuedChapters: queued,
        cancelledChapters: cancelled,
        overallProgress,
        isComplete,
        chapters: chapterList,
      });
    } catch (error) {
      console.error("Error fetching import progress:", error);
      res.status(500).json({ error: "Failed to fetch import progress" });
    }
  },
);

// POST /api/library/import/:mangaId/cancel - Cancel pending chapters
router.post(
  "/import/:mangaId/cancel",
  async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      if (!mangaId) {
        res.status(400).json({ error: "mangaId is required" });
        return;
      }
      const { chapterRepository } = await import("../database");
      const chapters = await chapterRepository.findByMangaId(mangaId);

      let cancelledChapters = 0;
      for (const ch of chapters as any[]) {
        if (ch.importStatus === "pending" || ch.importStatus === "downloading") {
          await chapterRepository.update(ch.id, {
            importStatus: "cancelled",
          });
          cancelledChapters++;
        }
      }

      // Cancel all pending/running import tasks for this manga. For running
      // tasks the processor aborts its worker; the row is then removed so a
      // later retry starts from a clean queue.
      const tasks = await global.taskRepository.getByManga(mangaId);
      let cancelledTasks = 0;
      for (const task of tasks) {
        if (task.status === "pending" || task.status === "running") {
          await global.queueProcessor?.cancelTask(task.id);
          await global.taskRepository.cancel(task.id);
          cancelledTasks++;
        }
      }

      res.json({
        success: true,
        cancelledChapters,
        cancelledTasks,
        message:
          cancelledChapters + cancelledTasks === 0
            ? "No active import work to cancel."
            : `Cancelled ${cancelledChapters} pending chapter${cancelledChapters === 1 ? "" : "s"} and ${cancelledTasks} queue task${cancelledTasks === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      console.error("Error cancelling import:", error);
      res.status(500).json({ error: "Failed to cancel import" });
    }
  },
);

// POST /api/library/scan - Scan all configured sources
router.post("/scan", async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = await scanLibrary(global.pluginManager);
    res.json(results);
  } catch (error) {
    console.error("Error scanning library:", error);
    res.status(500).json({ error: "Failed to scan library" });
  }
});

// POST /api/library/manga/:id/check-updates - Check for new chapters from source
router.post(
  "/manga/:id/check-updates",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const mangaId = req.params.id as string;

      const { mangaRepository, chapterRepository } =
        await import("../database");
      const manga = await mangaRepository.findById(mangaId);
      if (!manga) {
        res.status(404).json({ error: "Manga not found" });
        return;
      }

      const sourceMangaId = manga.sourceMangaId;
      const sourceId = manga.sourceId;
      if (!sourceMangaId || !sourceId) {
        res.status(400).json({ error: "Manga has no source information" });
        return;
      }

      const source = global.pluginManager.getSource(sourceId);
      if (!source || !source.checkForUpdates) {
        res
          .status(404)
          .json({ error: "Source not found or does not support updates" });
        return;
      }

      // Find the last known chapter ID (by highest sortOrder)
      const existingChapters = await chapterRepository.findByMangaId(mangaId);
      const lastChapter =
        existingChapters.length > 0
          ? existingChapters.reduce((a: any, b: any) =>
              a.sortOrder > b.sortOrder ? a : b,
            )
          : null;
      const lastChapterId = lastChapter?.chapterId;

      // Check for new chapters
      const newSourceChapters = await source.checkForUpdates(
        sourceMangaId,
        lastChapterId,
      );

      if (!newSourceChapters || newSourceChapters.length === 0) {
        await mangaRepository.update(mangaId, {
          lastSourceCheck: new Date().toISOString(),
        });
        res.json({ newChaptersFound: 0, chapters: [] });
        return;
      }

      // Deduplicate against existing chapters
      const existingChapterIds = new Set(
        existingChapters.map((c: any) => c.chapterId),
      );
      const trulyNewChapters = newSourceChapters.filter(
        (c: any) => !existingChapterIds.has(c.chapterId),
      );

      if (trulyNewChapters.length === 0) {
        await mangaRepository.update(mangaId, {
          lastSourceCheck: new Date().toISOString(),
        });
        res.json({ newChaptersFound: 0, chapters: [] });
        return;
      }

      // Deduplicate within source response
      const seenIds = new Set<string>();
      const uniqueNewChapters = trulyNewChapters.filter((c: any) => {
        if (seenIds.has(c.chapterId)) return false;
        seenIds.add(c.chapterId);
        return true;
      });

      // Insert new chapters and queue for download
      const createdChapters = [];
      for (const chapter of uniqueNewChapters) {
        try {
          await chapterRepository.create({
            id: uuidv4(),
            mangaId: mangaId,
            chapterId: chapter.chapterId,
            title: chapter.title,
            pagesCount: chapter.pageCount || 0,
            sortOrder: chapter.sortOrder,
            importStatus: "pending",
          });

          await global.taskRepository.create({
            type: "chapter",
            mangaId: mangaId,
            chapterId: chapter.chapterId,
            sortOrder: chapter.sortOrder,
            sourceId: sourceId,
            sourceChapterId: chapter.sourceChapterId,
          });

          createdChapters.push(chapter);
        } catch (err: any) {
          if (err.message?.includes("UNIQUE constraint failed")) {
            console.log(
              `[Updates] Chapter ${chapter.chapterId} already exists, skipping`,
            );
          } else {
            console.error(
              `[Updates] Failed to create chapter ${chapter.chapterId}:`,
              err,
            );
          }
        }
      }

      // Update last source check timestamp
      await mangaRepository.update(mangaId, {
        lastSourceCheck: new Date().toISOString(),
      });

      res.json({
        newChaptersFound: createdChapters.length,
        chapters: createdChapters,
      });
    } catch (error) {
      console.error("Error checking for updates:", error);
      res.status(500).json({ error: "Failed to check for updates" });
    }
  },
);

// POST /api/library/manga/:id/download-all - Download all pending chapters
router.post(
  "/manga/:id/download-all",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const mangaId = req.params.id as string;

      const { mangaRepository, chapterRepository } =
        await import("../database");
      const manga = await mangaRepository.findById(mangaId);
      if (!manga) {
        res.status(404).json({ error: "Manga not found" });
        return;
      }

      // Get all pending chapters
      const allChapters = await chapterRepository.findByMangaId(mangaId);
      const pendingChapters = allChapters.filter(
        (c: any) => c.importStatus === "pending",
      );

      if (pendingChapters.length === 0) {
        res.json({ chaptersQueued: 0 });
        return;
      }

      // Resolve source to get sourceChapterId for each pending chapter
      const dlSourceId = manga.sourceId;
      const dlSourceMangaId = manga.sourceMangaId;
      const chapterSourceMap = new Map<string, string>();

      if (dlSourceMangaId) {
        const source = global.pluginManager.getSource(dlSourceId || "unknown");
        if (source) {
          try {
            const mangaDetails = await source.getMangaDetails(dlSourceMangaId);
            for (const sc of mangaDetails.chapters) {
              chapterSourceMap.set(sc.chapterId, sc.sourceChapterId);
            }
          } catch (err) {
            console.error("[DownloadAll] Failed to fetch source details:", err);
          }
        }
      }

      // Queue each pending chapter
      let chaptersQueued = 0;
      for (const chapter of pendingChapters) {
        try {
          // Check if already queued
          const existingTask = await global.taskRepository.getByChapter(
            mangaId,
            chapter.chapterId,
          );
          if (
            existingTask &&
            ["pending", "running"].includes(existingTask.status)
          ) {
            continue;
          }

          await global.taskRepository.create({
            type: "chapter",
            mangaId: mangaId,
            chapterId: chapter.chapterId,
            sortOrder: chapter.sortOrder,
            sourceId: dlSourceId || "unknown",
            sourceChapterId:
              chapterSourceMap.get(chapter.chapterId) || chapter.chapterId,
          });
          chaptersQueued++;
        } catch (err) {
          console.error(
            `[DownloadAll] Failed to queue chapter ${chapter.chapterId}:`,
            err,
          );
        }
      }

      res.json({ chaptersQueued });
    } catch (error) {
      console.error("Error queueing all chapters:", error);
      res.status(500).json({ error: "Failed to queue all chapters" });
    }
  },
);

// POST /api/library/check-updates - Check for updates across all library manga
async function checkSingleMangaForUpdates(manga: {
  id: string;
  title: string;
  sourceId: string | null;
  sourceMangaId: string | null;
}): Promise<{
  mangaId: string;
  title: string;
  newChapters: number;
  error?: string;
}> {
  try {
    const sourceMangaId = manga.sourceMangaId;
    const sourceId = manga.sourceId;
    if (!sourceMangaId || !sourceId) {
      return {
        mangaId: manga.id,
        title: manga.title,
        newChapters: 0,
        error: "No source info",
      };
    }

    const source = global.pluginManager.getSource(sourceId);
    if (!source || !source.checkForUpdates) {
      return {
        mangaId: manga.id,
        title: manga.title,
        newChapters: 0,
        error: "Source not found or no update support",
      };
    }

    const { mangaRepository, chapterRepository } = await import("../database");
    const existingChapters = await chapterRepository.findByMangaId(manga.id);
    const lastChapter =
      existingChapters.length > 0
        ? existingChapters.reduce((a: any, b: any) =>
            a.sortOrder > b.sortOrder ? a : b,
          )
        : null;
    const lastChapterId = lastChapter?.chapterId;

    const newSourceChapters = await source.checkForUpdates(
      sourceMangaId,
      lastChapterId,
    );
    if (!newSourceChapters || newSourceChapters.length === 0) {
      await mangaRepository.update(manga.id, {
        lastSourceCheck: new Date().toISOString(),
      });
      return { mangaId: manga.id, title: manga.title, newChapters: 0 };
    }

    const existingChapterIds = new Set(
      existingChapters.map((c: any) => c.chapterId),
    );
    const trulyNew = newSourceChapters.filter(
      (c: any) => !existingChapterIds.has(c.chapterId),
    );
    if (trulyNew.length === 0) {
      await mangaRepository.update(manga.id, {
        lastSourceCheck: new Date().toISOString(),
      });
      return { mangaId: manga.id, title: manga.title, newChapters: 0 };
    }

    const seenIds = new Set<string>();
    const uniqueNew = trulyNew.filter((c: any) => {
      if (seenIds.has(c.chapterId)) return false;
      seenIds.add(c.chapterId);
      return true;
    });

    let created = 0;
    for (const chapter of uniqueNew) {
      try {
        await chapterRepository.create({
          id: uuidv4(),
          mangaId: manga.id,
          chapterId: chapter.chapterId,
          title: chapter.title,
          pagesCount: chapter.pageCount || 0,
          sortOrder: chapter.sortOrder,
          importStatus: "pending",
        });

        await global.taskRepository.create({
          type: "chapter",
          mangaId: manga.id,
          chapterId: chapter.chapterId,
          sortOrder: chapter.sortOrder,
          sourceId: sourceId,
          sourceChapterId: chapter.sourceChapterId,
        });
        created++;
      } catch (err: any) {
        if (!err.message?.includes("UNIQUE constraint failed")) {
          console.error(
            `[LibraryUpdate] Failed for manga ${manga.id} chapter ${chapter.chapterId}:`,
            err,
          );
        }
      }
    }

    await mangaRepository.update(manga.id, {
      lastSourceCheck: new Date().toISOString(),
    });
    return { mangaId: manga.id, title: manga.title, newChapters: created };
  } catch (err) {
    return {
      mangaId: manga.id,
      title: manga.title,
      newChapters: 0,
      error: (err as Error).message,
    };
  }
}

router.post(
  "/check-updates",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const { mangaRepository } = await import("../database");
      const allManga = await mangaRepository.findAll();

      // Process manga concurrently with a limit of 5
      const CONCURRENCY = 5;
      const results: Array<{
        mangaId: string;
        title: string;
        newChapters: number;
        error?: string;
      }> = [];
      let totalNewChapters = 0;
      let updatedCount = 0;

      for (let i = 0; i < allManga.length; i += CONCURRENCY) {
        const chunk = allManga.slice(i, i + CONCURRENCY);
        const chunkResults = await Promise.allSettled(
          chunk.map((manga) => checkSingleMangaForUpdates(manga)),
        );

        for (const r of chunkResults) {
          if (r.status === "fulfilled") {
            results.push(r.value);
            if (r.value.newChapters > 0) updatedCount++;
            totalNewChapters += r.value.newChapters;
          } else {
            results.push({
              mangaId: "unknown",
              title: "unknown",
              newChapters: 0,
              error: r.reason?.message || "Unknown error",
            });
          }
        }
      }

      res.json({
        checked: allManga.length,
        updated: updatedCount,
        newChaptersTotal: totalNewChapters,
        results,
      });
    } catch (error) {
      console.error("Error checking library for updates:", error);
      res.status(500).json({ error: "Failed to check library for updates" });
    }
  },
);

// POST /api/library/sources/local/configure - Configure local source
router.post(
  "/sources/local/configure",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { directories } = req.body;

      if (!Array.isArray(directories)) {
        res.status(400).json({ error: "directories must be an array" });
        return;
      }

      // Save to settings file
      await setLibraryDirectories(directories);

      // Get the local source and reinitialize with new config
      const localSource = global.pluginManager.getSource(
        "local",
      ) as LocalSource;
      if (localSource) {
        await localSource.initialize({ directories });
      }

      res.json({ success: true, directories });
    } catch (error) {
      console.error("Error configuring local source:", error);
      res.status(500).json({ error: "Failed to configure local source" });
    }
  },
);

// GET /api/library/sources/local/configure - Get configured directories
router.get(
  "/sources/local/configure",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const directories = await getLibraryDirectories();
      res.json({ directories });
    } catch (error) {
      console.error("Error loading local source config:", error);
      res.status(500).json({ error: "Failed to load configuration" });
    }
  },
);

// GET /api/library/search - Search manga
router.get("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Query parameter q is required" });
      return;
    }

    const { mangaRepository } = await import("../database");
    const results = await mangaRepository.search(q);
    res.json(results);
  } catch (error) {
    console.error("Error searching manga:", error);
    res.status(500).json({ error: "Failed to search manga" });
  }
});

// Helper function to auto-fetch metadata from AniList
async function fetchMetadataForManga(
  mangaId: string,
  title: string,
): Promise<void> {
  console.log(`[AutoFetch] Fetching metadata for: ${title}`);

  const { mangaRepository } = await import("../database");

  // Search for manga on AniList
  const results = await anilistService.searchManga(title);

  if (results.length === 0) {
    console.log(`[AutoFetch] No metadata found for: ${title}`);
    return;
  }

  // Find best match
  const bestMatch = anilistService.findBestMatch(title, results);

  if (!bestMatch) {
    console.log(`[AutoFetch] No good match found for: ${title}`);
    return;
  }

  console.log(`[AutoFetch] Best match found: ${bestMatch.title.romaji}`);

  // Download cover image if available
  let coverImagePath: string | undefined;
  if (bestMatch.coverImage?.large) {
    try {
      coverImagePath = await downloadCoverImage(
        bestMatch.coverImage.large,
        mangaId,
      );
      console.log(`[AutoFetch] Cover image downloaded: ${coverImagePath}`);
    } catch (err) {
      console.error(`[AutoFetch] Failed to download cover image:`, err);
    }
  }

  // Update manga with metadata
  await mangaRepository.update(mangaId, {
    title: bestMatch.title.english || bestMatch.title.romaji || title,
    altTitles: [
      bestMatch.title.romaji,
      bestMatch.title.english,
      bestMatch.title.native,
      ...bestMatch.synonyms,
    ].filter(
      (t): t is string =>
        !!t && t !== (bestMatch.title.english || bestMatch.title.romaji),
    ),
    description: bestMatch.description,
    author: bestMatch.author,
    artist: bestMatch.artist,
    status: bestMatch.status as any,
    coverImage: coverImagePath,
    bannerImage: bestMatch.bannerImage || undefined,
    anilistId: bestMatch.id,
    genres: bestMatch.genres,
    mediaType: bestMatch.mediaType,
    tags: bestMatch.tags.map((t) => t.name),
    lastMetadataSync: new Date().toISOString(),
  });

  console.log(`[AutoFetch] Metadata saved for: ${title}`);
}

// Helper function to download cover image
async function downloadCoverImage(
  url: string,
  mangaId: string,
): Promise<string> {
  const coversDir = join(DATA_DIR, "covers");
  await mkdir(coversDir, { recursive: true });

  const filename = `${mangaId}.jpg`;
  const filepath = join(coversDir, filename);

  const response = await axios.get(url, { responseType: "arraybuffer" });
  await writeFile(filepath, response.data);
  return `/api/content/covers/${filename}`;
}

export default router;
