import { Router, Request, Response } from "express";
import {
  db,
  manga,
  chapters,
  readingProgress,
  mangaCategories,
  categories,
} from "../database";
import {
  eq,
  like,
  or,
  and,
  desc,
  asc,
  sql,
  inArray,
  isNotNull,
  isNull,
} from "drizzle-orm";
import { count } from "drizzle-orm";

const router: Router = Router();

interface FilterOptions {
  search?: string;
  status?: string;
  mediaType?: string;
  genre?: string;
  category?: string;
  readingStatus?: "reading" | "completed" | "not-started" | "all";
  sortBy: "title" | "lastRead" | "dateAdded" | "progress" | "chapterCount";
  sortOrder: "asc" | "desc";
}

// GET /api/library/filter - Get manga with filters and sorting
router.get("/filter", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      search,
      status,
      mediaType,
      genre,
      category,
      readingStatus,
      sortBy = "lastRead",
      sortOrder = "desc",
    } = req.query as unknown as FilterOptions;

    // Build base query
    let query = db
      .select({
        manga: manga,
        progress: readingProgress,
        chapterCount: count(chapters.id),
      })
      .from(manga)
      .leftJoin(readingProgress, eq(manga.id, readingProgress.mangaId))
      .leftJoin(chapters, eq(manga.id, chapters.mangaId));

    // Build where conditions
    const conditions: any[] = [];

    // Search filter
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          like(manga.title, searchPattern),
          like(manga.author || "", searchPattern),
          like(manga.artist || "", searchPattern),
          like(manga.description || "", searchPattern),
        ),
      );
    }

    // Status filter
    if (status && status !== "all") {
      conditions.push(eq(manga.status, status));
    }

    // Media type filter
    if (mediaType && mediaType !== "all") {
      conditions.push(eq(manga.mediaType, mediaType));
    }

    // Genre filter - check if genre is in the genres JSON array
    if (genre) {
      conditions.push(like(manga.genres || "", `%"${genre}"%`));
    }

    // Category filter - requires joining with mangaCategories
    if (category) {
      // Add join with mangaCategories if not already joined
      query = query.leftJoin(
        mangaCategories,
        eq(manga.id, mangaCategories.mangaId),
      ) as any;
      conditions.push(eq(mangaCategories.categoryId, category));
    }

    // Reading status filter
    if (readingStatus && readingStatus !== "all") {
      switch (readingStatus) {
        case "reading":
          // Has progress but not completed (pageNumber < totalPages)
          conditions.push(
            and(
              isNotNull(readingProgress.id),
              sql`${readingProgress.pageNumber} < ${readingProgress.totalPages}`,
            ),
          );
          break;
        case "completed":
          // Completed: pageNumber >= totalPages
          conditions.push(
            sql`${readingProgress.pageNumber} >= ${readingProgress.totalPages}`,
          );
          break;
        case "not-started":
          conditions.push(isNull(readingProgress.id));
          break;
      }
    }

    // Apply all conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Group by manga
    query = query.groupBy(manga.id) as any;

    // Apply sorting
    const sortColumn = getSortColumn(sortBy);
    const sortFn = sortOrder === "asc" ? asc : desc;
    query = query.orderBy(sortFn(sortColumn)) as any;

    // Execute query
    const results = await query;

    // Transform results
    const mangaList = results.map((r) => ({
      ...r.manga,
      progress: r.progress || undefined,
      chapterCount: r.chapterCount,
    }));

    res.json(mangaList);
  } catch (error) {
    console.error("Error filtering manga:", error);
    res.status(500).json({ error: "Failed to filter manga" });
  }
});

// GET /api/library/filters/options - Get available filter options
router.get(
  "/filters/options",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      // Get all categories
      const allCategories = await db.query.categories.findMany({
        orderBy: asc(categories.sortOrder),
      });

      // Get status counts
      const statusCounts = await db
        .select({
          status: manga.status,
          count: count(manga.id),
        })
        .from(manga)
        .groupBy(manga.status);

      // Get media type counts
      const mediaTypeCounts = await db
        .select({
          mediaType: manga.mediaType,
          count: count(manga.id),
        })
        .from(manga)
        .groupBy(manga.mediaType);

      // Get reading status counts
      const totalManga = await db
        .select({ count: count(manga.id) })
        .from(manga);
      // Reading: has progress but pageNumber < totalPages
      const readingCount = await db
        .select({ count: count(readingProgress.id) })
        .from(readingProgress)
        .where(
          sql`${readingProgress.pageNumber} < ${readingProgress.totalPages}`,
        );
      // Completed: pageNumber >= totalPages
      const completedCount = await db
        .select({ count: count(readingProgress.id) })
        .from(readingProgress)
        .where(
          sql`${readingProgress.pageNumber} >= ${readingProgress.totalPages}`,
        );

      res.json({
        categories: allCategories,
        statuses: statusCounts,
        mediaTypes: mediaTypeCounts,
        readingStatus: {
          total: totalManga[0]?.count || 0,
          reading: readingCount[0]?.count || 0,
          completed: completedCount[0]?.count || 0,
          notStarted:
            (totalManga[0]?.count || 0) -
            (readingCount[0]?.count || 0) -
            (completedCount[0]?.count || 0),
        },
      });
    } catch (error) {
      console.error("Error getting filter options:", error);
      res.status(500).json({ error: "Failed to get filter options" });
    }
  },
);

function getSortColumn(sortBy: string) {
  switch (sortBy) {
    case "title":
      return manga.title;
    case "lastRead":
      return sql`COALESCE(${readingProgress.lastReadAt}, ${manga.createdAt})`;
    case "dateAdded":
      return manga.createdAt;
    case "progress":
      // Calculate progress dynamically: (pageNumber / totalPages) * 100
      return sql`CASE 
        WHEN ${readingProgress.totalPages} > 0 
        THEN (${readingProgress.pageNumber} * 100.0 / ${readingProgress.totalPages}) 
        ELSE 0 
      END`;
    case "chapterCount":
      return count(chapters.id);
    default:
      return sql`COALESCE(${readingProgress.lastReadAt}, ${manga.createdAt})`;
  }
}

export default router;
