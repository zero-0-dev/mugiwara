import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClientProvider } from "../src/api/context";
import { ToastProvider } from "../src/components/Toast";
import { Library } from "../src/components/Library";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown> | undefined>,
}));

vi.mock("../src/components/AddMangaModal", () => ({
  AddMangaModal: () => null,
}));

vi.mock("../src/api/hooks", () => ({
  useLibrary: (filters?: Record<string, unknown>) => {
    mocks.calls.push(filters);
    return { data: [], isLoading: false };
  },
  useFilterOptions: () => ({
    data: { categories: [] },
    isLoading: false,
  }),
  useDeleteManga: () => ({ mutate: vi.fn(), isPending: false }),
  useCheckLibraryUpdates: () => ({ mutate: vi.fn(), isPending: false }),
  useTrackerStatus: () => ({ data: undefined, isLoading: false }),
}));

function renderLibrary(initialEntries: string[], initialIndex = 0) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/", element: <Library onMangaSelect={vi.fn()} /> }],
    { initialEntries, initialIndex },
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

  return router;
}

describe("library URL state", () => {
  it("reads search, filters and sort from the URL", async () => {
    mocks.calls.length = 0;
    renderLibrary([
      "/?q=dragon&status=ongoing&sort=title&order=asc&reading=reading",
    ]);

    const input = (await screen.findByLabelText(
      "Search library",
    )) as HTMLInputElement;
    expect(input.value).toBe("dragon");

    const call = mocks.calls.at(-1);
    expect(call).toMatchObject({
      search: "dragon",
      status: "ongoing",
      sortBy: "title",
      sortOrder: "asc",
      readingStatus: "reading",
    });
  });

  it("writes search to the URL without adding history entries", async () => {
    mocks.calls.length = 0;
    const router = renderLibrary(["/?status=ongoing"]);

    const input = (await screen.findByLabelText(
      "Search library",
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "one piece" } });

    await waitFor(() =>
      expect(router.state.location.search).toContain("q=one+piece"),
    );
    // Replace, not push: the search debounce must not fill the back stack.
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.search).toContain("status=ongoing");
  });

  it("restores the search box when navigating back to a filtered URL", async () => {
    const router = renderLibrary(
      ["/?q=dragon", "/?q=onepiece"],
      1,
    );

    const input = (await screen.findByLabelText(
      "Search library",
    )) as HTMLInputElement;
    expect(input.value).toBe("onepiece");

    await router.navigate(-1);
    await waitFor(() => expect(input.value).toBe("dragon"));
  });

  it("clears every filter from the URL", async () => {
    const router = renderLibrary(["/?q=dragon&status=ongoing"]);

    fireEvent.click(
      await screen.findByRole("button", { name: "Clear Filters" }),
    );

    await waitFor(() => expect(router.state.location.search).toBe(""));
  });
});
