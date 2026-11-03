import { Router, Request, Response } from "express";
import type { LibraryReadingStatus } from "@mugiwara-manga/types";
import { libraryRepository, type LibrarySortBy } from "../database";

const router: Router = Router();

interface LibraryFilterQuery {
  search?: string;
  status?: string;
  mediaType?: string;
  genre?: string;
  category?: string;
  readingStatus?: LibraryReadingStatus | "all";
  sortBy?: LibrarySortBy;
  sortOrder?: "asc" | "desc";
}

const SORT_FIELDS: LibrarySortBy[] = [
  "title",
  "lastRead",
  "dateAdded",
  "progress",
  "chapterCount",
];

const READING_STATUSES: Array<LibraryReadingStatus | "all"> = [
  "all",
  "reading",
  "completed",
  "not-started",
];

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
      sortBy,
      sortOrder,
    } = req.query as unknown as LibraryFilterQuery;

    const validSortBy =
      sortBy && SORT_FIELDS.includes(sortBy) ? sortBy : "lastRead";
    const validSortOrder = sortOrder === "asc" ? "asc" : "desc";
    const validReadingStatus =
      readingStatus && READING_STATUSES.includes(readingStatus)
        ? readingStatus
        : "all";

    const mangaList = await libraryRepository.findAll({
      search: search || undefined,
      status: status || undefined,
      mediaType: mediaType || undefined,
      genre: genre || undefined,
      category: category || undefined,
      readingStatus: validReadingStatus,
      sortBy: validSortBy,
      sortOrder: validSortOrder,
    });

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
      const options = await libraryRepository.getFilterOptions();
      res.json(options);
    } catch (error) {
      console.error("Error getting filter options:", error);
      res.status(500).json({ error: "Failed to get filter options" });
    }
  },
);

export default router;
