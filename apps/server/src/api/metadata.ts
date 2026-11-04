import { Router, Request, Response } from "express";
import { mangaRepository } from "../database";
import { anilistService } from "../services/anilist";
import axios from "axios";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const router: Router = Router({ mergeParams: true });
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

// POST /api/manga/:id/metadata/fetch - Fetch metadata from AniList
router.post("/fetch", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.mangaId;
    if (!id) {
      res.status(400).json({ error: "ID is required" });
      return;
    }

    const manga = await mangaRepository.findById(id);
    if (!manga) {
      res.status(404).json({ error: "Manga not found" });
      return;
    }

    // Search for manga on AniList
    const results = await anilistService.searchManga(manga.title);

    if (results.length === 0) {
      res.status(404).json({ error: "No metadata found" });
      return;
    }

    // Find best match
    const bestMatch = anilistService.findBestMatch(manga.title, results);

    if (!bestMatch) {
      res.status(404).json({ error: "No good match found" });
      return;
    }

    console.log("[Metadata] Best match found:", {
      title: bestMatch.title.romaji,
      mediaType: bestMatch.mediaType,
      hasCoverImage: !!bestMatch.coverImage,
      coverImageUrl: bestMatch.coverImage?.large,
    });

    // Download cover image if available
    let coverImagePath: string | undefined;
    if (bestMatch.coverImage?.large) {
      try {
        coverImagePath = await downloadCoverImage(
          bestMatch.coverImage.large,
          id,
        );
        console.log("[Metadata] Cover image downloaded:", coverImagePath);
      } catch (err) {
        console.error("[Metadata] Failed to download cover image:", err);
      }
    } else {
      console.log("[Metadata] No cover image URL available");
    }

    // Update manga with metadata
    await mangaRepository.update(id, {
      title: bestMatch.title.english || bestMatch.title.romaji || manga.title,
      altTitles: [
        bestMatch.title.romaji,
        bestMatch.title.english,
        bestMatch.title.native,
        ...bestMatch.synonyms,
      ].filter(
        (t): t is string =>
          !!t && t !== (bestMatch.title.english || bestMatch.title.romaji),
      ),
      description: bestMatch.description || manga.description,
      author: bestMatch.author || manga.author,
      artist: bestMatch.artist || manga.artist,
      status: bestMatch.status as any,
      coverImage: coverImagePath || manga.coverImage,
      bannerImage: bestMatch.bannerImage || undefined,
      anilistId: bestMatch.id,
      genres: bestMatch.genres,
      mediaType: bestMatch.mediaType,
      tags: bestMatch.tags.map((t) => t.name),
      lastMetadataSync: new Date().toISOString(),
    });

    const updatedManga = await mangaRepository.findById(id);
    res.json({
      success: true,
      manga: updatedManga,
      matchedTitle: bestMatch.title.romaji,
      confidence: "high",
    });
  } catch (error) {
    console.error("Error fetching metadata:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

// GET /api/manga/:id/metadata/search - Search for manga metadata without applying
router.get("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.mangaId;
    const { query } = req.query;

    if (!id) {
      res.status(400).json({ error: "ID is required" });
      return;
    }

    const manga = await mangaRepository.findById(id);
    if (!manga) {
      res.status(404).json({ error: "Manga not found" });
      return;
    }

    const searchQuery = (query as string) || manga.title;
    const results = await anilistService.searchManga(searchQuery);

    res.json({
      manga: {
        id: manga.id,
        title: manga.title,
      },
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description?.substring(0, 200) + "...",
        coverImage: r.coverImage,
        year: r.startDate.year,
        genres: r.genres.slice(0, 5),
      })),
    });
  } catch (error) {
    console.error("Error searching metadata:", error);
    res.status(500).json({ error: "Failed to search metadata" });
  }
});

// POST /api/manga/:id/metadata/apply - Apply selected metadata
router.post("/apply", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.mangaId;
    const { anilistId } = req.body;

    if (!id || !anilistId) {
      res.status(400).json({ error: "ID and anilistId are required" });
      return;
    }

    const manga = await mangaRepository.findById(id);
    if (!manga) {
      res.status(404).json({ error: "Manga not found" });
      return;
    }

    const metadata = await anilistService.getMangaById(anilistId);
    if (!metadata) {
      res.status(404).json({ error: "Metadata not found" });
      return;
    }

    console.log("[Metadata] Got metadata from AniList:", {
      title: metadata.title.romaji,
      hasCoverImage: !!metadata.coverImage,
      coverImageUrl: metadata.coverImage?.large,
    });

    // Download cover image
    let coverImagePath: string | undefined;
    if (metadata.coverImage?.large) {
      try {
        coverImagePath = await downloadCoverImage(
          metadata.coverImage.large,
          id,
        );
        console.log("[Metadata] Cover image downloaded:", coverImagePath);
      } catch (err) {
        console.error("[Metadata] Failed to download cover image:", err);
      }
    } else {
      console.log("[Metadata] No cover image URL available");
    }

    await mangaRepository.update(id, {
      title: metadata.title.english || metadata.title.romaji || manga.title,
      altTitles: [
        metadata.title.romaji,
        metadata.title.english,
        metadata.title.native,
        ...metadata.synonyms,
      ].filter(
        (t): t is string =>
          !!t && t !== (metadata.title.english || metadata.title.romaji),
      ),
      description: metadata.description || manga.description,
      author: metadata.author || manga.author,
      artist: metadata.artist || manga.artist,
      status: metadata.status as any,
      coverImage: coverImagePath || manga.coverImage,
      bannerImage: metadata.bannerImage || undefined,
      anilistId: metadata.id,
      genres: metadata.genres,
      tags: metadata.tags.map((t) => t.name),
      mediaType: metadata.mediaType,
      lastMetadataSync: new Date().toISOString(),
    });

    const updatedManga = await mangaRepository.findById(id);
    res.json({
      success: true,
      manga: updatedManga,
    });
  } catch (error) {
    console.error("Error applying metadata:", error);
    res.status(500).json({ error: "Failed to apply metadata" });
  }
});

async function downloadCoverImage(
  url: string,
  mangaId: string,
): Promise<string> {
  const coversDir = join(DATA_DIR, "covers");
  await mkdir(coversDir, { recursive: true });

  const filename = `${mangaId}.jpg`;
  const filepath = join(coversDir, filename);

  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    await writeFile(filepath, response.data);
    return `/api/content/covers/${filename}`;
  } catch (error) {
    console.error("Failed to download cover image:", error);
    throw error;
  }
}

export default router;
