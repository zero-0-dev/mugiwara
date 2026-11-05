import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAddMangaToCategory,
  useCreateCategory,
  useDeleteCategory,
  useRemoveMangaFromCategory,
  useUpdateCategory,
} from "../src/api/hooks";

const mocks = vi.hoisted(() => ({
  api: {
    createCategory: vi.fn().mockResolvedValue({ id: "new" }),
    updateCategory: vi.fn().mockResolvedValue({ id: "cat-1" }),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
    addMangaToCategory: vi.fn().mockResolvedValue(undefined),
    removeMangaFromCategory: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../src/api/context", () => ({
  useApiClient: () => mocks.api,
}));

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
}

describe("category mutation hooks", () => {
  it("creates a category and refreshes the library filters", async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "Favorites", color: "#ff0000" });
    });

    expect(mocks.api.createCategory).toHaveBeenCalledWith({
      name: "Favorites",
      color: "#ff0000",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["categories"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["filterOptions"] });
  });

  it("updates a category and refreshes assignments, library and filters", async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "cat-1",
        name: "Renamed",
        color: "#00ff00",
        sortOrder: 3,
      });
    });

    expect(mocks.api.updateCategory).toHaveBeenCalledWith("cat-1", {
      name: "Renamed",
      color: "#00ff00",
      sortOrder: 3,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["categories"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["filterOptions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["library"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mangaCategories"] });
  });

  it("deletes a category and refreshes the library and filters", async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteCategory(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("cat-1");
    });

    expect(mocks.api.deleteCategory).toHaveBeenCalledWith("cat-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["categories"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["filterOptions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["library"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mangaCategories"] });
  });

  it("refreshes category counts and filters after assigning or unassigning", async () => {
    const { invalidate, wrapper } = setup();
    const add = renderHook(() => useAddMangaToCategory("manga-1"), {
      wrapper,
    });

    await act(async () => {
      await add.result.current.mutateAsync("cat-1");
    });

    expect(mocks.api.addMangaToCategory).toHaveBeenCalledWith(
      "manga-1",
      "cat-1",
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["filterOptions"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["categories"] });

    const remove = renderHook(() => useRemoveMangaFromCategory("manga-1"), {
      wrapper,
    });

    await act(async () => {
      await remove.result.current.mutateAsync("cat-1");
    });

    expect(mocks.api.removeMangaFromCategory).toHaveBeenCalledWith(
      "manga-1",
      "cat-1",
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["mangaCategories", "manga-1"],
    });
  });
});
