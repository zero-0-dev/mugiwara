import { Router, Request, Response } from "express";
import {
  getLibraryDirectories,
  setLibraryDirectories,
} from "../services/settings";
import { scanLibrary } from "../services/library-scan";
import { LocalSource } from "@mugiwara/source-local";
import { getRegisteredSourceIds } from "../plugins/registry";
import { anilistService } from "../services/anilist";
import axios from "axios";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { v4 as uuidv4 } from "uuid";

const router: Router = Router();

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

    const results = await source.search(q);
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
    const mangaDetails = await source.getMangaDetails(sourceMangaId);

    // Get default storage backend
    const defaultBackendId = global.storageManager.getDefaultBackendId();
    if (!defaultBackendId) {
      res.status(400).json({ error: "No default storage backend configured" });
      return;
    }

    // Check if manga already exists
    const { mangaRepository } = await import("../database");
    const existing = await mangaRepository.findBySource(
      sourceId,
      sourceMangaId,
    );

    let mangaId: string;
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

    // Get existing chapters
    const { chapterRepository } = await import("../database");
    const existingChapters = await chapterRepository.findByMangaId(mangaId);
    const existingChapterIds = new Set(
      existingChapters.map((c: any) => c.chapterId),
    );

    // Determine which chapters to import
    const chaptersToImport = chapters || mangaDetails.chapters;

    // Deduplicate chapters from source (some sources may return duplicates)
    const seenChapterIds = new Set<string>();
    const uniqueChapters = chaptersToImport.filter((c: any) => {
      if (seenChapterIds.has(c.chapterId)) {
        return false;
      }
      seenChapterIds.add(c.chapterId);
      return true;
    });

    // Filter out already existing chapters
    const newChapters = uniqueChapters.filter(
      (c: any) => !existingChapterIds.has(c.chapterId),
    );

    // Add chapters to database with pending status
    let chaptersAdded = 0;
    for (const chapter of newChapters) {
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

    // Queue chapters for import
    let chaptersQueued = 0;
    for (const chapter of newChapters) {
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
      chaptersAdded,
      chaptersQueued,
    });
  } catch (error) {
    console.error("Error importing manga:", error);
    res.status(500).json({ error: "Failed to import manga" });
  }
});

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
  const coversDir = join(process.cwd(), "data", "covers");
  await mkdir(coversDir, { recursive: true });

  const filename = `${mangaId}.jpg`;
  const filepath = join(coversDir, filename);

  const response = await axios.get(url, { responseType: "arraybuffer" });
  await writeFile(filepath, response.data);
  return `/api/content/covers/${filename}`;
}

export default router;
