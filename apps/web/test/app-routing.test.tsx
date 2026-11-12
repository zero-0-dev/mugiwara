import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "../src/api/context";
import { ToastProvider } from "../src/components/Toast";
import { AppChromeProvider } from "../src/routing/appChrome";
import { appRoutes } from "../src/routing/routes";

vi.mock("../src/components/Library", () => ({
  Library: ({ onMangaSelect }: { onMangaSelect: (id: string) => void }) => (
    <div>
      <h1>Library screen</h1>
      <button onClick={() => onMangaSelect("m1")}>Open manga</button>
    </div>
  ),
}));

vi.mock("../src/components/MangaDetail", () => ({
  MangaDetail: ({
    mangaId,
    onBack,
    onReadChapter,
  }: {
    mangaId: string;
    onBack: () => void;
    onReadChapter: (id: string) => void;
  }) => (
    <div>
      <h1>Detail {mangaId}</h1>
      <button onClick={onBack}>Detail back</button>
      <button onClick={() => onReadChapter("c1")}>Read chapter</button>
    </div>
  ),
}));

vi.mock("../src/components/Reader", () => ({
  Reader: ({
    mangaId,
    chapterId,
    onBack,
  }: {
    mangaId: string;
    chapterId: string;
    onBack: () => void;
  }) => (
    <div>
      <h1>
        Reader {mangaId} {chapterId}
      </h1>
      <button onClick={onBack}>Reader back</button>
    </div>
  ),
}));

vi.mock("../src/components/Discover", () => ({
  Discover: ({
    onMangaSelect,
  }: {
    onMangaSelect: (id: number) => void;
  }) => (
    <div>
      <h1>Discover screen</h1>
      <button onClick={() => onMangaSelect(42)}>Open discover manga</button>
    </div>
  ),
}));

vi.mock("../src/components/DiscoverDetail", () => ({
  DiscoverDetail: ({
    anilistId,
    onAddedToLibrary,
  }: {
    anilistId: number;
    onAddedToLibrary: () => void;
  }) => (
    <div>
      <h1>Discover detail {anilistId}</h1>
      <button onClick={onAddedToLibrary}>Added to library</button>
    </div>
  ),
}));

vi.mock("../src/components/SettingsPage", () => ({
  SettingsPage: ({
    activeTab,
    onTabChange,
    onBack,
  }: {
    activeTab?: string;
    onTabChange: (tab: string) => void;
    onBack: () => void;
  }) => (
    <div>
      <h1>Settings {activeTab ?? "reading"}</h1>
      <button onClick={() => onTabChange("downloads")}>Downloads tab</button>
      <button onClick={onBack}>Settings back</button>
    </div>
  ),
}));

vi.mock("../src/components/DiskSpacePage", () => ({
  DiskSpacePage: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>Disk space screen</h1>
      <button onClick={onBack}>Disk space back</button>
    </div>
  ),
}));

vi.mock("../src/api/hooks", () => ({
  useChapterProgress: () => ({ data: null, isLoading: false }),
  useChapters: () => ({
    data: [
      { id: "c1", chapterId: "1" },
      { id: "c2", chapterId: "2" },
    ],
  }),
  useQueueStats: () => ({
    data: { pending: 2, running: 1, complete: 0, error: 0, total: 3 },
  }),
  useLibrary: () => ({ data: [{ id: "unread" }] }),
}));

function renderAt(initialEntry: string | string[], initialIndex = 0) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const entries = Array.isArray(initialEntry) ? initialEntry : [initialEntry];
  const router = createMemoryRouter(appRoutes as RouteObject[], {
    initialEntries: entries,
    initialIndex,
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider baseUrl="">
        <ToastProvider>
          <AppChromeProvider
            value={{
              serverLabel: "test",
              canChangeServer: false,
              onChangeServer: vi.fn(),
            }}
          >
            <RouterProvider router={router} />
          </AppChromeProvider>
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );

  return { router, ...result };
}

describe("app routes", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("renders every route and a useful 404", async () => {
    const { unmount } = renderAt("/");
    expect(await screen.findByText("Library screen")).toBeTruthy();
    unmount();

    const detail = renderAt("/manga/m1");
    expect(await screen.findByText("Detail m1")).toBeTruthy();
    detail.unmount();

    const reader = renderAt("/read/m1/c1");
    expect(await screen.findByText("Reader m1 c1")).toBeTruthy();
    reader.unmount();

    const discover = renderAt("/discover");
    expect(await screen.findByText("Discover screen")).toBeTruthy();
    discover.unmount();

    const discoverDetail = renderAt("/discover/42");
    expect(await screen.findByText("Discover detail 42")).toBeTruthy();
    discoverDetail.unmount();

    const settings = renderAt("/settings");
    expect(await screen.findByText("Settings reading")).toBeTruthy();
    settings.unmount();

    const queue = renderAt("/settings/queue");
    expect(await screen.findByText("Settings queue")).toBeTruthy();
    queue.unmount();

    const disk = renderAt("/disk-space");
    expect(await screen.findByText("Disk space screen")).toBeTruthy();
    disk.unmount();

    const missing = renderAt("/this/route/does-not-exist");
    expect(await screen.findByText("Page not found")).toBeTruthy();
    missing.unmount();
  });

  it("navigates with URLs and supports browser back and forward", async () => {
    const { router } = renderAt("/");

    expect(await screen.findByText("Library screen")).toBeTruthy();
    screen.getByRole("button", { name: "Open manga" }).click();
    expect(await screen.findByText("Detail m1")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/manga/m1");

    screen.getByRole("button", { name: "Read chapter" }).click();
    expect(await screen.findByText("Reader m1 c1")).toBeTruthy();
    expect(router.state.location.pathname).toBe("/read/m1/c1");

    await router.navigate(-1);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/manga/m1"),
    );
    expect(await screen.findByText("Detail m1")).toBeTruthy();

    await router.navigate(1);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/read/m1/c1"),
    );
    expect(await screen.findByText("Reader m1 c1")).toBeTruthy();
  });

  it("keeps the settings tab in the URL", async () => {
    const { router } = renderAt("/settings/reading");

    expect(await screen.findByText("Settings reading")).toBeTruthy();
    screen.getByRole("button", { name: "Downloads tab" }).click();

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/settings/downloads"),
    );
    expect(await screen.findByText("Settings downloads")).toBeTruthy();
  });

  it("switches screens from the mobile tab bar", async () => {
    const { router } = renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Primary" });

    expect(
      within(nav).getByRole("button", { name: "Library" }).getAttribute("title"),
    ).toContain("1 unread titles");
    expect(
      within(nav)
        .getByRole("button", { name: "Downloads" })
        .getAttribute("title"),
    ).toContain("3 active downloads");

    within(nav).getByRole("button", { name: "Discover" }).click();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/discover"),
    );
    expect(await screen.findByText("Discover screen")).toBeTruthy();

    within(nav).getByRole("button", { name: "Downloads" }).click();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/settings/queue"),
    );

    within(nav).getByRole("button", { name: "Settings" }).click();
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));

    within(nav).getByRole("button", { name: "Library" }).click();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("does not duplicate history when adding a discover manga", async () => {
    const { router } = renderAt(["/discover", "/discover/42"], 1);

    expect(await screen.findByText("Discover detail 42")).toBeTruthy();
    screen.getByRole("button", { name: "Added to library" }).click();

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    // The detail entry was replaced, so the discover list remains the previous
    // entry instead of a duplicated library entry.
    await router.navigate(-1);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/discover"),
    );
  });
});
