import { mangaRepository, chapterRepository } from "../database";
import { PluginManager } from "../plugins";
import { v4 as uuidv4 } from "uuid";

interface ScanResults {
  added: number;
  updated: number;
  errors: string[];
}

export async function scanLibrary(
  pluginManager: PluginManager,
): Promise<ScanResults> {
  const results: ScanResults = {
    added: 0,
    updated: 0,
    errors: [],
  };

  for (const source of pluginManager.getAllSources()) {
    try {
      if (source.metadata.id === "local") {
        // Scan local directories
        const searchResults = await source.search("");

        for (const result of searchResults) {
          try {
            // Get full manga details including chapters
            const mangaDetails = await source.getMangaDetails(
              result.sourceMangaId,
            );

            // Check if manga exists
            const existing = await mangaRepository.findBySource(
              "local",
              result.sourceMangaId,
            );

            if (existing) {
              // Update existing manga chapters
              const existingChapters = await chapterRepository.findByMangaId(
                existing.id,
              );
              const existingChapterIds = new Set(
                existingChapters.map((c: any) => c.chapterId),
              );

              for (const chapter of mangaDetails.chapters) {
                // Skip if chapter id already exists
                if (!existingChapterIds.has(chapter.chapterId)) {
                  try {
                    await chapterRepository.create({
                      id: uuidv4(),
                      mangaId: existing.id,
                      chapterId: chapter.chapterId,
                      title: chapter.title,
                      pagesCount: 0, // Will be determined when reading
                      sortOrder: chapter.sortOrder,
                      importStatus: "complete",
                    });
                    results.updated++;
                  } catch (err) {
                    // Silently skip duplicates due to UNIQUE constraint
                    if (
                      err instanceof Error &&
                      err.message.includes("UNIQUE constraint failed")
                    ) {
                      console.log(
                        `Skipping duplicate chapter: ${chapter.title}`,
                      );
                    } else {
                      throw err;
                    }
                  }
                }
              }
            } else {
              // Create new manga
              const newManga = await mangaRepository.create({
                id: uuidv4(),
                title: mangaDetails.title,
                sourceId: "local",
                sourceMangaId: result.sourceMangaId,
                status: "ongoing",
                mediaType: "manga",
              });

              if (!newManga) {
                throw new Error("Failed to create manga");
              }

              // Create chapters
              for (const chapter of mangaDetails.chapters) {
                await chapterRepository.create({
                  id: uuidv4(),
                  mangaId: newManga.id,
                  chapterId: chapter.chapterId,
                  title: chapter.title,
                  pagesCount: 0, // Will be determined when reading
                  sortOrder: chapter.sortOrder,
                  importStatus: "complete",
                });
              }

              results.added++;
            }
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            results.errors.push(
              `Failed to process ${result.title}: ${message}`,
            );
          }
        }
      } else {
        // Handle other source types
        const manga = await source.search("");
        console.log(
          `Scanned ${manga.length} items from ${source.metadata.name}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.errors.push(
        `Failed to scan source ${source.metadata.name}: ${message}`,
      );
    }
  }

  return results;
}
