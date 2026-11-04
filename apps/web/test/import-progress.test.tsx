import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportProgress } from "../src/components/add-manga/ImportProgress";
import type {
  CancelImportResult,
  ImportProgressResponse,
} from "../src/components/add-manga/types";

const mocks = vi.hoisted(() => ({
  progress: null as ImportProgressResponse | null,
  progressError: null as Error | null,
  cancel: vi.fn(),
}));

vi.mock("../src/api/hooks", () => ({
  useImportProgress: () => ({ data: mocks.progress, error: mocks.progressError }),
  useCancelImport: () => ({
    mutateAsync: mocks.cancel,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function makeProgress(overrides: Partial<ImportProgressResponse> = {}): ImportProgressResponse {
  return {
    mangaId: "manga-1",
    totalChapters: 3,
    completedChapters: 0,
    erroredChapters: 0,
    downloadingChapters: 1,
    queuedChapters: 2,
    cancelledChapters: 0,
    overallProgress: 20,
    isComplete: false,
    chapters: [
      {
        chapterId: "3",
        title: "Chapter 3",
        sortOrder: 3000,
        status: "downloading",
        totalPages: 10,
        completedPages: 2,
      },
      {
        chapterId: "2",
        title: "Chapter 2",
        sortOrder: 2000,
        status: "queued",
      },
      {
        chapterId: "1",
        title: "Chapter 1",
        sortOrder: 1000,
        status: "queued",
      },
    ],
    ...overrides,
  };
}

describe("ImportProgress", () => {
  beforeEach(() => {
    mocks.progress = makeProgress();
    mocks.progressError = null;
    mocks.cancel.mockReset();
  });

  it("shows queued and downloading states", () => {
    render(
      <ImportProgress
        mangaId="manga-1"
        mangaTitle="My Manga"
        onComplete={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );

    expect(screen.getByText(/Downloading: My Manga/)).toBeTruthy();
    expect(screen.getByText(/1 downloading · 2 queued/)).toBeTruthy();
    expect(screen.getByText("2 / 10 pages")).toBeTruthy();
    expect(screen.getAllByText(/Ch\. 2/)).toBeTruthy();
  });

  it("reports import completion only after the queue settles", async () => {
    const onComplete = vi.fn();
    mocks.progress = makeProgress({
      completedChapters: 3,
      downloadingChapters: 0,
      queuedChapters: 0,
      overallProgress: 100,
      isComplete: true,
      chapters: [
        { chapterId: "3", sortOrder: 3000, status: "complete" },
        { chapterId: "2", sortOrder: 2000, status: "complete" },
        { chapterId: "1", sortOrder: 1000, status: "complete" },
      ],
    });

    render(
      <ImportProgress
        mangaId="manga-1"
        mangaTitle="My Manga"
        onComplete={onComplete}
        onCancelled={vi.fn()}
      />,
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(mocks.progress));
    expect(screen.getByText("Import complete: My Manga")).toBeTruthy();
  });

  it("cancels pending work and reports the server result", async () => {
    const result: CancelImportResult = {
      success: true,
      cancelledChapters: 2,
      cancelledTasks: 2,
      message: "Cancelled 2 pending chapters and 2 queue tasks.",
    };
    mocks.cancel.mockResolvedValue(result);
    const onCancelled = vi.fn();

    render(
      <ImportProgress
        mangaId="manga-1"
        mangaTitle="My Manga"
        onComplete={vi.fn()}
        onCancelled={onCancelled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel remaining" }));

    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith("manga-1"));
    expect(onCancelled).toHaveBeenCalledWith(mocks.progress, result);
  });

  it("shows a cancellation failure instead of pretending it worked", async () => {
    mocks.cancel.mockRejectedValue(new Error("Cannot reach the Mugiwara server."));
    const onCancelled = vi.fn();

    render(
      <ImportProgress
        mangaId="manga-1"
        mangaTitle="My Manga"
        onComplete={vi.fn()}
        onCancelled={onCancelled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel remaining" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Cannot reach"),
    );
    expect(onCancelled).not.toHaveBeenCalled();
  });
});
