import { describe, expect, it } from "vitest";
import type { Chapter } from "@mugiwara-manga/types";
import {
  getChapterDownloadStatus,
  isChapterDownloadable,
} from "./chapter-download-status";

const chapter = (
  overrides: Partial<Pick<Chapter, "importStatus" | "pagesCount">> = {},
): Pick<Chapter, "importStatus" | "pagesCount"> => ({
  importStatus: "pending",
  pagesCount: 0,
  ...overrides,
});

describe("getChapterDownloadStatus", () => {
  it("treats a pending chapter without a queue task as downloadable", () => {
    // Chapters created by an import stay `pending` even when no download was
    // ever queued, so they must not look like they are waiting in the queue.
    expect(getChapterDownloadStatus(chapter())).toBe("idle");
    expect(isChapterDownloadable("idle")).toBe(true);
  });

  it("shows queued and running tasks as active", () => {
    expect(getChapterDownloadStatus(chapter(), "pending")).toBe("pending");
    expect(getChapterDownloadStatus(chapter(), "paused")).toBe("pending");
    expect(getChapterDownloadStatus(chapter({ pagesCount: 3 }), "running")).toBe(
      "downloading",
    );
    expect(getChapterDownloadStatus(chapter(), "running")).toBe("downloading");
  });

  it("reports downloaded chapters as complete", () => {
    expect(getChapterDownloadStatus(chapter({ pagesCount: 12 }))).toBe(
      "complete",
    );
    expect(
      getChapterDownloadStatus(chapter({ importStatus: "complete" })),
    ).toBe("complete");
  });

  it("keeps errored chapters retryable", () => {
    expect(getChapterDownloadStatus(chapter({ importStatus: "error" }))).toBe(
      "error",
    );
    expect(isChapterDownloadable("error")).toBe(true);
  });

  it("does not offer downloads for queued or finished chapters", () => {
    expect(isChapterDownloadable("pending")).toBe(false);
    expect(isChapterDownloadable("downloading")).toBe(false);
    expect(isChapterDownloadable("complete")).toBe(false);
  });
});
