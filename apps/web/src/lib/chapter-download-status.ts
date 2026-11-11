import type { Chapter } from "@mugiwara-manga/types";

export type ChapterDownloadStatus =
  | "idle"
  | "pending"
  | "downloading"
  | "complete"
  | "error";

export type ChapterTaskStatus = "pending" | "running" | "paused";

/**
 * Resolves the download state shown on the manga detail page.
 *
 * `importStatus` alone is not enough: chapters that were imported but never
 * queued keep `importStatus: "pending"`, so the queue task is the only signal
 * that a download is actually waiting. Without an active task a pending
 * chapter is simply "not downloaded yet" and stays downloadable.
 */
export function getChapterDownloadStatus(
  chapter: Pick<Chapter, "importStatus" | "pagesCount">,
  taskStatus?: ChapterTaskStatus,
): ChapterDownloadStatus {
  if (taskStatus === "running" || chapter.importStatus === "downloading") {
    return "downloading";
  }
  if (chapter.pagesCount > 0 || chapter.importStatus === "complete") {
    return "complete";
  }
  if (taskStatus === "pending" || taskStatus === "paused") {
    return "pending";
  }
  if (chapter.importStatus === "error") {
    return "error";
  }
  return "idle";
}

/** Chapters that can be queued for download from the detail page. */
export function isChapterDownloadable(status: ChapterDownloadStatus): boolean {
  return status === "idle" || status === "error";
}
