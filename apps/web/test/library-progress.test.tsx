import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "../src/api/context";
import { ToastProvider } from "../src/components/Toast";
import { Library } from "../src/components/Library";

vi.mock("../src/components/AddMangaModal", () => ({
  AddMangaModal: () => null,
}));

vi.mock("../src/api/hooks", () => ({
  useLibrary: () => ({
    data: [
      {
        id: "manga-1",
        title: "Fixture Manga",
        sourceId: "local",
        status: "ongoing",
        mediaType: "manga",
        chapterCount: 100,
        progressPercent: 10,
        readingStatus: "reading",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        // Chapter-level progress for the last opened chapter: the library
        // card must ignore this and use progressPercent instead.
        progress: {
          id: "progress-1",
          mangaId: "manga-1",
          chapterId: "chapter-11",
          pageNumber: 5,
          totalPages: 10,
          percentComplete: 50,
          isCompleted: false,
          lastReadAt: "2024-01-02T00:00:00.000Z",
        },
      },
    ],
    isLoading: false,
  }),
  useFilterOptions: () => ({
    data: { categories: [] },
    isLoading: false,
  }),
  useDeleteManga: () => ({ mutate: vi.fn(), isPending: false }),
  useCheckLibraryUpdates: () => ({ mutate: vi.fn(), isPending: false }),
  useTrackerStatus: () => ({ data: undefined, isLoading: false }),
}));

describe("library manga progress", () => {
  it("shows completed chapters over total chapters, not last-chapter progress", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const router = createMemoryRouter(
      [{ path: "/", element: <Library onMangaSelect={vi.fn()} /> }],
      { initialEntries: ["/"] },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider baseUrl="">
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ApiClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Fixture Manga")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "10",
    );
  });
});
