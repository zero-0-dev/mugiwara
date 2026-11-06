import type { chapters } from "../database/schema";

type ChapterRow = typeof chapters.$inferSelect;

export interface ChapterDownloadSummary {
  /** Pages actually written to storage during this download. */
  pageCount: number;
  /**
   * Page count reported by the source. Archives are stored as a single page
   * file while the reader extracts every page from that file, so the source
   * count is the one the UI and the reader need.
   */
  sourcePageCount?: number;
}

/**
 * Database state for a chapter whose pages are completely stored.
 *
 * Shared by the queue processor and the on-demand reader path so both mark a
 * chapter as downloaded in the same way.
 */
export function completedChapterState(
  chapter: Pick<ChapterRow, "pagesCount">,
  { pageCount, sourcePageCount }: ChapterDownloadSummary,
) {
  return {
    pagesCount: Math.max(
      chapter.pagesCount ?? 0,
      pageCount,
      sourcePageCount ?? 0,
    ),
    importProgress: 100,
    importStatus: "complete" as const,
  };
}

/**
 * State for a chapter whose download failed after it started.
 *
 * The caller removes the partially written files first; the chapter must stay
 * retryable instead of looking like a finished download.
 */
export function failedChapterState() {
  return {
    pagesCount: 0,
    importProgress: 0,
    importStatus: "error" as const,
  };
}
