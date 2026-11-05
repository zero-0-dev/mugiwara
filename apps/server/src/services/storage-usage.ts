import { eq, sql } from "drizzle-orm";
import type { StorageBackend } from "@mugiwara-manga/plugin-api";
import { chapters } from "../database/schema";

export type StorageUsageSort = "size" | "lastRead";
export type StorageUsageOrder = "asc" | "desc";

export interface StorageUsageOptions {
  sort?: StorageUsageSort;
  order?: StorageUsageOrder;
}

export interface StorageUsageMangaRow {
  mangaId: string;
  title: string;
  coverImage?: string;
  storageBackendId: string | null;
  downloadedChapterCount: number;
  totalBytes: number;
  lastReadAt: string | null;
  // Set when the backend could not be queried. The row is still returned so
  // the UI can show which titles are unreachable instead of failing the page.
  error?: string;
}

export interface StorageUsageSummary {
  totalBytes: number;
  mangaWithDownloads: number;
  downloadedChapters: number;
}

export interface StorageUsageResponse {
  summary: StorageUsageSummary;
  manga: StorageUsageMangaRow[];
}

export interface ChapterDeleteResult {
  chapterId: string;
  chapterRecordId: string;
  title: string | null;
  bytesFreed: number;
  success: boolean;
  error?: string;
}

export interface DeleteMangaDownloadsResult {
  mangaId: string;
  deletedCount: number;
  failedCount: number;
  bytesFreed: number;
  results: ChapterDeleteResult[];
}

export interface StorageUsageDeps {
  // Drizzle database instance. Kept loosely typed so tests can pass the real
  // database or a compatible wrapper.
  db: any;
  getBackendForManga: (mangaId: string) => Promise<StorageBackend>;
  // Cancels pending/running download tasks for one chapter and waits for any
  // in-flight write to stop. Provided by the API layer from the queue.
  cancelChapterTasks?: (mangaId: string, chapterId: string) => Promise<void>;
}

interface MangaRow {
  id: string;
  title: string;
  coverImage: string | null;
  storageBackendId: string | null;
}

interface ChapterRow {
  id: string;
  mangaId: string;
  chapterId: string;
  title: string | null;
  importStatus: string | null;
  pagesCount: number;
}

interface LastReadRow {
  mangaId: string;
  lastReadAt: string | null;
}

interface UsageDb {
  all<T>(query: unknown): Promise<T[]>;
  query: any;
  update: any;
}

// A chapter can contain stored files while its database status is anything from
// an interrupted download ("error"/"downloading") to a finished one
// ("complete"). "pending" with a non-zero page count can also be a leftover
// from an older attempt, so both signals are considered.
const DOWNLOAD_STATUSES = new Set(["complete", "downloading", "error"]);

function isDownloadCandidate(chapter: ChapterRow): boolean {
  return (
    chapter.pagesCount > 0 || DOWNLOAD_STATUSES.has(chapter.importStatus ?? "")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function measureChapters(
  backend: StorageBackend,
  mangaId: string,
  chapterIds: string[],
): Promise<Map<string, number>> {
  if (chapterIds.length === 0) return new Map();

  if (typeof backend.getMangaUsage === "function") {
    const usage = await backend.getMangaUsage(mangaId, chapterIds);
    return new Map(
      (usage.chapters ?? []).map((chapter) => [
        chapter.chapterId,
        chapter.bytes,
      ]),
    );
  }

  const entries = await Promise.all(
    chapterIds.map(
      async (chapterId) =>
        [chapterId, await backend.getChapterSize(mangaId, chapterId)] as const,
    ),
  );
  return new Map(entries);
}

function compareRows(
  a: StorageUsageMangaRow,
  b: StorageUsageMangaRow,
  sort: StorageUsageSort,
  order: StorageUsageOrder,
): number {
  const direction = order === "asc" ? 1 : -1;

  if (sort === "lastRead") {
    const aTime = a.lastReadAt ? Date.parse(a.lastReadAt) : null;
    const bTime = b.lastReadAt ? Date.parse(b.lastReadAt) : null;

    // Unread titles always sort last, regardless of direction, so they do not
    // bury the titles the user actually read.
    if (aTime === null && bTime === null) {
      return a.title.localeCompare(b.title);
    }
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    if (aTime !== bTime) return (aTime - bTime) * direction;
    return a.title.localeCompare(b.title);
  }

  if (a.totalBytes !== b.totalBytes) {
    return (a.totalBytes - b.totalBytes) * direction;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Aggregates disk usage for every library manga.
 *
 * Sizes come from the storage backend (native metadata where available), not
 * from the database, so deleting files outside Mugiwara cannot show stale
 * numbers. `lastReadAt` is the most recent `reading_progress.last_read_at`
 * across every device.
 */
export async function getStorageUsage(
  deps: StorageUsageDeps,
  options: StorageUsageOptions = {},
): Promise<StorageUsageResponse> {
  const sort: StorageUsageSort =
    options.sort === "lastRead" ? "lastRead" : "size";
  const order: StorageUsageOrder = options.order === "asc" ? "asc" : "desc";

  const db = deps.db as UsageDb;

  const [mangaRows, chapterRows, lastReadRows] = await Promise.all([
    db.all<MangaRow>(sql`
      SELECT id, title, cover_image AS coverImage,
             storage_backend_id AS storageBackendId
      FROM manga
    `),
    db.all<ChapterRow>(sql`
      SELECT id, manga_id AS mangaId, chapter_id AS chapterId, title,
             import_status AS importStatus, pages_count AS pagesCount
      FROM chapters
    `),
    db.all<LastReadRow>(sql`
      SELECT manga_id AS mangaId, MAX(last_read_at) AS lastReadAt
      FROM reading_progress
      GROUP BY manga_id
    `),
  ]);

  const chaptersByManga = new Map<string, ChapterRow[]>();
  for (const chapter of chapterRows) {
    const list = chaptersByManga.get(chapter.mangaId) ?? [];
    list.push(chapter);
    chaptersByManga.set(chapter.mangaId, list);
  }

  const lastReadByManga = new Map(
    lastReadRows.map((row) => [row.mangaId, row.lastReadAt]),
  );

  const rows = await Promise.all(
    mangaRows.map(async (manga): Promise<StorageUsageMangaRow> => {
      const candidates = (chaptersByManga.get(manga.id) ?? []).filter(
        isDownloadCandidate,
      );
      const base: StorageUsageMangaRow = {
        mangaId: manga.id,
        title: manga.title,
        coverImage: manga.coverImage ?? undefined,
        storageBackendId: manga.storageBackendId,
        downloadedChapterCount: 0,
        totalBytes: 0,
        lastReadAt: lastReadByManga.get(manga.id) ?? null,
      };

      if (candidates.length === 0) return base;

      try {
        const backend = await deps.getBackendForManga(manga.id);
        const sizes = await measureChapters(
          backend,
          manga.id,
          candidates.map((chapter) => chapter.chapterId),
        );

        let totalBytes = 0;
        let downloadedChapterCount = 0;
        for (const chapter of candidates) {
          const bytes = sizes.get(chapter.chapterId) ?? 0;
          totalBytes += bytes;
          if (bytes > 0) downloadedChapterCount++;
        }

        return { ...base, totalBytes, downloadedChapterCount };
      } catch (error) {
        return { ...base, error: errorMessage(error) };
      }
    }),
  );

  rows.sort((a, b) => compareRows(a, b, sort, order));

  const summary = rows.reduce<StorageUsageSummary>(
    (acc, row) => {
      acc.totalBytes += row.totalBytes;
      acc.downloadedChapters += row.downloadedChapterCount;
      if (row.downloadedChapterCount > 0) acc.mangaWithDownloads++;
      return acc;
    },
    { totalBytes: 0, mangaWithDownloads: 0, downloadedChapters: 0 },
  );

  return { summary, manga: rows };
}

async function deleteChapterFiles(
  deps: StorageUsageDeps,
  mangaId: string,
  chapter: ChapterRow,
  bytesFreed: number,
  resolvedBackend?: StorageBackend,
): Promise<ChapterDeleteResult> {
  const result: ChapterDeleteResult = {
    chapterId: chapter.chapterId,
    chapterRecordId: chapter.id,
    title: chapter.title,
    bytesFreed: 0,
    success: false,
  };

  try {
    // Abort and await an in-flight download first. Otherwise it could recreate
    // pages after the storage deletion runs.
    if (deps.cancelChapterTasks) {
      await deps.cancelChapterTasks(mangaId, chapter.chapterId);
    }

    const backend = resolvedBackend ?? (await deps.getBackendForManga(mangaId));
    await backend.deleteChapter(mangaId, chapter.chapterId);

    // Idempotent reset: deleting already-missing files still returns the
    // chapter to a downloadable state.
    await deps.db
      .update(chapters)
      .set({
        importStatus: "pending",
        importProgress: 0,
        pagesCount: 0,
      })
      .where(eq(chapters.id, chapter.id));

    return { ...result, success: true, bytesFreed };
  } catch (error) {
    // Leave the database untouched: if files may remain, the chapter must keep
    // its downloaded state so the user is not told it was removed.
    return { ...result, error: errorMessage(error) };
  }
}

export async function deleteMangaDownloads(
  deps: StorageUsageDeps,
  mangaId: string,
): Promise<DeleteMangaDownloadsResult> {
  const chapterRows = await deps.db.query.chapters.findMany({
    where: eq(chapters.mangaId, mangaId),
  });

  const targets = (chapterRows as ChapterRow[]).filter(isDownloadCandidate);
  const results: ChapterDeleteResult[] = [];

  let sizes = new Map<string, number>();
  let resolvedBackend: StorageBackend | undefined;
  if (targets.length > 0) {
    try {
      resolvedBackend = await deps.getBackendForManga(mangaId);
      sizes = await measureChapters(
        resolvedBackend,
        mangaId,
        targets.map((chapter) => chapter.chapterId),
      );
    } catch {
      // A failed size measurement must not block deletion; bytes freed are
      // simply reported as zero for the affected chapters. The backend is
      // resolved again per chapter only when this lookup failed.
      sizes = new Map();
      resolvedBackend = undefined;
    }
  }

  // Delete one at a time so a slow or failing chapter cannot prevent the rest
  // from being processed.
  for (const chapter of targets) {
    const bytes = sizes.get(chapter.chapterId) ?? 0;
    results.push(
      await deleteChapterFiles(deps, mangaId, chapter, bytes, resolvedBackend),
    );
  }

  return {
    mangaId,
    deletedCount: results.filter((result) => result.success).length,
    failedCount: results.filter((result) => !result.success).length,
    bytesFreed: results.reduce(
      (sum, result) => sum + (result.success ? result.bytesFreed : 0),
      0,
    ),
    results,
  };
}

export async function deleteChapterDownload(
  deps: StorageUsageDeps,
  mangaId: string,
  chapterPublicId: string,
): Promise<ChapterDeleteResult | null> {
  const chapterRows = await deps.db.query.chapters.findMany({
    where: eq(chapters.mangaId, mangaId),
  });
  const chapter = (chapterRows as ChapterRow[]).find(
    (row) => row.chapterId === chapterPublicId,
  );

  if (!chapter) return null;

  let bytes = 0;
  let backend: StorageBackend | undefined;
  try {
    backend = await deps.getBackendForManga(mangaId);
    bytes = await backend.getChapterSize(mangaId, chapter.chapterId);
  } catch {
    // Size is informational only; deletion still proceeds.
  }

  return deleteChapterFiles(deps, mangaId, chapter, bytes, backend);
}
