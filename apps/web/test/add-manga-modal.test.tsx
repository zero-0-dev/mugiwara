import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "../src/api/context";
import { AddMangaModal } from "../src/components/AddMangaModal";
import { ToastProvider } from "../src/components/Toast";

const mocks = vi.hoisted(() => ({
  lastSearch: null as [string | null, string] | null,
  results: [] as Array<{ sourceMangaId: string; title: string }>,
  details: null as any,
  importMutate: vi.fn(),
}));

vi.mock("../src/api/hooks", () => ({
  useSources: () => ({
    data: [{ id: "local", name: "Local Files", description: "Import from folders" }],
    isLoading: false,
  }),
  useSearchSource: (sourceId: string | null, query: string) => {
    mocks.lastSearch = [sourceId, query];
    if (query.includes("/missing")) {
      return {
        data: [],
        isFetching: false,
        error: new Error('Folder not found on the server: "/missing". Check the path.'),
      };
    }
    return {
      data: query.includes("My Manga") ? mocks.results : [],
      isFetching: false,
      error: null,
    };
  },
  useSourceManga: () => ({ data: mocks.details, isFetching: false }),
  useImportManga: () => ({
    mutate: mocks.importMutate,
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    data: undefined,
  }),
  useCancelImport: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider baseUrl="">
        <ToastProvider>
          <AddMangaModal
            onClose={vi.fn()}
            onSuccess={vi.fn()}
            onViewManga={vi.fn()}
          />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

function stubElectron(selectFolder: () => Promise<string | null>) {
  (window as any).electronAPI = {
    getServerPort: vi.fn(),
    getApiUrl: vi.fn().mockResolvedValue(""),
    getAppVersion: vi.fn(),
    selectFolder,
    openFolder: vi.fn(),
    platform: "linux",
  };
}

describe("AddMangaModal local import", () => {
  beforeEach(() => {
    mocks.lastSearch = null;
    mocks.results = [{ sourceMangaId: "/srv/manga/My Manga", title: "My Manga" }];
    mocks.details = {
      sourceMangaId: "/srv/manga/My Manga",
      title: "My Manga",
      chapters: [
        { sourceChapterId: "/srv/manga/My Manga/Chapter 1", chapterId: "1", title: "Chapter 1", sortOrder: 1000 },
      ],
    };
    mocks.importMutate.mockReset();
  });

  it("fills the path from the Electron folder picker and searches it", async () => {
    const selectFolder = vi.fn().mockResolvedValue("/srv/manga/My Manga");
    stubElectron(selectFolder);

    renderModal();

    const browse = await screen.findByRole("button", { name: "Browse…" });
    fireEvent.click(browse);

    await waitFor(() => expect(selectFolder).toHaveBeenCalledTimes(1));
    const input = screen.getByLabelText("Local folder path") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("/srv/manga/My Manga"));
    await waitFor(() =>
      expect(mocks.lastSearch).toEqual(["local", "/srv/manga/My Manga"]),
    );
    expect(await screen.findByText("My Manga")).toBeTruthy();

    fireEvent.click(screen.getByText("My Manga"));
    expect(await screen.findByText("1 chapters available")).toBeTruthy();
  });

  it("shows an actionable error for an invalid server path", async () => {
    stubElectron(vi.fn().mockResolvedValue("/missing"));
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Browse…" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Folder not found on the server");
  });

  it("focuses the path field instead of pretending to browse on web", async () => {
    renderModal();

    const input = screen.getByLabelText("Local folder path") as HTMLInputElement;
    fireEvent.click(await screen.findByRole("button", { name: "Enter server path" }));

    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: /Browse/ })).toBeNull();
  });

  it("validates a typed server path on Enter", async () => {
    renderModal();

    const input = screen.getByLabelText("Local folder path") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "/srv/manga/My Manga" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(mocks.lastSearch).toEqual(["local", "/srv/manga/My Manga"]),
    );
    expect(await screen.findByText("My Manga")).toBeTruthy();
  });
});
