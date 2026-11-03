import { asc, sql } from "drizzle-orm";
import type {
  LibraryFilterOptions,
  LibraryManga,
  LibraryReadingStatus,
} from "@mugiwara-manga/types";
import { db, categories } from "../index";
import { enrichProgressRecord } from "./progress";

export type LibrarySortBy =
  | "title"
  | "lastRead"
  | "dateAdded"
  | "progress"
  | "chapterCount";

export interface LibraryQueryOptions {
  search?: string;
  status?: string;
  mediaType?: string;
  genre?: string;
  category?: string;
  readingStatus?: LibraryReadingStatus | "all";
  sortBy?: LibrarySortBy;
  sortOrder?: "asc" | "desc";
}

interface LibraryRow {
  id: string;
  title: string;
  altTitles: string | null;
  description: string | null;
  author: string | null;
  artist: string | null;
  status: string;
  mediaType: string;
  coverImage: string | null;
  bannerImage: string | null;
  sourceId: string;
  sourceMangaId: string | null;
  storageBackendId: string | null;
  anilistId: number | null;
  genres: string | null;
  tags: string | null;
  lastMetadataSync: string | null;
  lastSourceCheck: string | null;
  createdAt: string;
  updatedAt: string;
  chapter_count: number;
  reading_status: LibraryReadingStatus;
  progress_id: string | null;
  progress_chapter_id: string | null;
  progress_page_number: number | null;
  progress_total_pages: number | null;
  progress_last_read_at: string | null;
  progress_device_id: string | null;
}

/**
 * Library aggregation shared by `/api/library/filter` and the legacy
 * `/api/manga` endpoint.
 *
 * The CTEs are evaluated once for the whole result set (no per-manga queries):
 * - `chapter_counts` counts chapter rows, which are already unique per manga.
 * - `chapter_latest` picks the most recent progress row per chapter across all
 *   devices, so one device re-reading a chapter cannot double-count it.
 * - `progress_stats` marks a manga completed only when every chapter has a
 *   completed latest row (and the manga has at least one chapter).
 * - `latest_progress` picks the most recent row per manga for the card.
 */
const LIBRARY_CTES = sql`
  WITH chapter_counts AS (
    SELECT c.manga_id AS manga_id,
           COUNT(DISTINCT c.id) AS chapter_count
    FROM chapters c
    GROUP BY c.manga_id
  ),
  chapter_latest AS (
    SELECT manga_id, chapter_id, page_number, total_pages, last_read_at
    FROM (
      SELECT rp.manga_id,
             rp.chapter_id,
             rp.page_number,
             rp.total_pages,
             rp.last_read_at,
             ROW_NUMBER() OVER (
               PARTITION BY rp.manga_id, rp.chapter_id
               ORDER BY datetime(rp.last_read_at) DESC, rp.id DESC
             ) AS rn
      FROM reading_progress rp
      WHERE rp.chapter_id IS NOT NULL
    )
    WHERE rn = 1
  ),
  progress_stats AS (
    SELECT cl.manga_id AS manga_id,
           COUNT(*) AS chapter_progress_count,
           SUM(
             CASE
               WHEN cl.total_pages > 0
                 AND (
                   cl.page_number >= cl.total_pages
                   OR (cl.page_number * 100.0 / cl.total_pages) >= 95
                 )
               THEN 1
               ELSE 0
             END
           ) AS completed_chapter_count
    FROM chapter_latest cl
    GROUP BY cl.manga_id
  ),
  latest_progress AS (
    SELECT id, manga_id, chapter_id, page_number, total_pages, last_read_at, device_id
    FROM (
      SELECT rp.*,
             ROW_NUMBER() OVER (
               PARTITION BY rp.manga_id
               ORDER BY datetime(rp.last_read_at) DESC, rp.id DESC
             ) AS rn
      FROM reading_progress rp
    )
    WHERE rn = 1
  ),
  library AS (
    SELECT
      m.id AS id,
      m.title AS title,
      m.alt_titles AS altTitles,
      m.description AS description,
      m.author AS author,
      m.artist AS artist,
      m.status AS status,
      m.media_type AS mediaType,
      m.cover_image AS coverImage,
      m.banner_image AS bannerImage,
      m.source_id AS sourceId,
      m.source_manga_id AS sourceMangaId,
      m.storage_backend_id AS storageBackendId,
      m.anilist_id AS anilistId,
      m.genres AS genres,
      m.tags AS tags,
      m.last_metadata_sync AS lastMetadataSync,
      m.last_source_check AS lastSourceCheck,
      m.created_at AS createdAt,
      m.updated_at AS updatedAt,
      COALESCE(cc.chapter_count, 0) AS chapter_count,
      COALESCE(ps.completed_chapter_count, 0) AS completed_chapter_count,
      lp.id AS progress_id,
      lp.chapter_id AS progress_chapter_id,
      lp.page_number AS progress_page_number,
      lp.total_pages AS progress_total_pages,
      lp.last_read_at AS progress_last_read_at,
      lp.device_id AS progress_device_id,
      CASE
        WHEN lp.id IS NULL THEN 'not-started'
        WHEN COALESCE(cc.chapter_count, 0) > 0
          AND COALESCE(ps.completed_chapter_count, 0) >= cc.chapter_count
          THEN 'completed'
        ELSE 'reading'
      END AS reading_status
    FROM manga m
    LEFT JOIN chapter_counts cc ON cc.manga_id = m.id
    LEFT JOIN progress_stats ps ON ps.manga_id = m.id
    LEFT JOIN latest_progress lp ON lp.manga_id = m.id
  )
`;

function parseJsonArray(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function mapRow(row: LibraryRow): LibraryManga {
  const rawProgress = row.progress_id
    ? {
        id: row.progress_id,
        mangaId: row.id,
        chapterId: row.progress_chapter_id,
        pageNumber: row.progress_page_number ?? 1,
        totalPages: row.progress_total_pages ?? 0,
        lastReadAt: row.progress_last_read_at ?? row.updatedAt,
        deviceId: row.progress_device_id ?? "default",
      }
    : null;
  const progress = enrichProgressRecord(rawProgress);

  return {
    id: row.id,
    title: row.title,
    altTitles: parseJsonArray(row.altTitles),
    description: row.description ?? undefined,
    author: row.author ?? undefined,
    artist: row.artist ?? undefined,
    status: row.status as LibraryManga["status"],
    mediaType: row.mediaType as LibraryManga["mediaType"],
    coverImage: row.coverImage ?? undefined,
    bannerImage: row.bannerImage ?? undefined,
    sourceId: row.sourceId,
    sourceMangaId: row.sourceMangaId ?? undefined,
    storageBackendId: row.storageBackendId ?? undefined,
    anilistId: row.anilistId ?? undefined,
    genres: parseJsonArray(row.genres),
    tags: parseJsonArray(row.tags),
    lastMetadataSync: row.lastMetadataSync ?? undefined,
    lastSourceCheck: row.lastSourceCheck ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    chapterCount: row.chapter_count,
    readingStatus: row.reading_status,
    progress: progress ?? undefined,
  };
}

function buildFilters(options: LibraryQueryOptions) {
  const conditions = [];

  if (options.search) {
    const pattern = `%${options.search}%`;
    conditions.push(
      sql`(title LIKE ${pattern} OR author LIKE ${pattern} OR artist LIKE ${pattern} OR description LIKE ${pattern})`,
    );
  }

  if (options.status && options.status !== "all") {
    conditions.push(sql`status = ${options.status}`);
  }

  if (options.mediaType && options.mediaType !== "all") {
    conditions.push(sql`mediaType = ${options.mediaType}`);
  }

  if (options.genre) {
    conditions.push(sql`genres LIKE ${`%"${options.genre}"%`}`);
  }

  if (options.category) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM manga_categories mc WHERE mc.manga_id = library.id AND mc.category_id = ${options.category})`,
    );
  }

  if (options.readingStatus && options.readingStatus !== "all") {
    conditions.push(sql`reading_status = ${options.readingStatus}`);
  }

  if (conditions.length === 0) return sql``;
  return sql` WHERE ${sql.join(conditions, sql` AND `)}`;
}

function orderExpression(sortBy: LibrarySortBy | undefined) {
  switch (sortBy) {
    case "title":
      return sql`title COLLATE NOCASE`;
    case "dateAdded":
      return sql`createdAt`;
    case "progress":
      return sql`CASE
        WHEN progress_total_pages > 0
        THEN (progress_page_number * 100.0 / progress_total_pages)
        ELSE 0
      END`;
    case "chapterCount":
      return sql`chapter_count`;
    case "lastRead":
    default:
      return sql`COALESCE(progress_last_read_at, createdAt)`;
  }
}

export const libraryRepository = {
  async findAll(options: LibraryQueryOptions = {}): Promise<LibraryManga[]> {
    const direction = options.sortOrder === "asc" ? sql`ASC` : sql`DESC`;
    const query = sql`${LIBRARY_CTES} SELECT * FROM library${buildFilters(options)} ORDER BY ${orderExpression(options.sortBy)} ${direction}, title COLLATE NOCASE ASC`;

    const rows = await db.all<LibraryRow>(query);
    return rows.map(mapRow);
  },

  async getFilterOptions(): Promise<LibraryFilterOptions> {
    const [allCategories, statusRows, mediaTypeRows, readingRows] =
      await Promise.all([
        db.query.categories.findMany({ orderBy: asc(categories.sortOrder) }),
        db.all<{ status: string; count: number }>(
          sql`SELECT status AS status, COUNT(*) AS count FROM manga GROUP BY status ORDER BY status`,
        ),
        db.all<{ mediaType: string; count: number }>(
          sql`SELECT media_type AS mediaType, COUNT(*) AS count FROM manga GROUP BY media_type ORDER BY media_type`,
        ),
        db.all<{ reading_status: LibraryReadingStatus; count: number }>(
          sql`${LIBRARY_CTES} SELECT reading_status, COUNT(*) AS count FROM library GROUP BY reading_status`,
        ),
      ]);

    const readingStatus = {
      total: 0,
      reading: 0,
      completed: 0,
      notStarted: 0,
    };

    for (const row of readingRows) {
      readingStatus.total += row.count;
      if (row.reading_status === "reading") readingStatus.reading = row.count;
      if (row.reading_status === "completed") readingStatus.completed = row.count;
      if (row.reading_status === "not-started") {
        readingStatus.notStarted = row.count;
      }
    }

    return {
      categories: allCategories.map((category) => ({
        ...category,
        color: category.color ?? undefined,
      })),
      statuses: statusRows,
      mediaTypes: mediaTypeRows,
      readingStatus,
    };
  },
};
