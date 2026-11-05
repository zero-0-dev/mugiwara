import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CategoriesSection } from "../src/components/settings/CategoriesSection";
import { ToastProvider } from "../src/components/Toast";

const mocks = vi.hoisted(() => ({
  categoryState: {
    data: [] as Array<Record<string, unknown>>,
    isLoading: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
    isFetching: false,
  },
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  updateMutateAsync: vi.fn().mockResolvedValue(undefined),
  deleteMutate: vi.fn(),
}));

vi.mock("../src/api/hooks", () => ({
  useCategories: () => mocks.categoryState,
  useCreateCategory: () => ({
    mutate: mocks.createMutate,
    isPending: false,
  }),
  useUpdateCategory: () => ({
    mutate: mocks.updateMutate,
    mutateAsync: mocks.updateMutateAsync,
    isPending: false,
  }),
  useDeleteCategory: () => ({
    mutate: mocks.deleteMutate,
    isPending: false,
  }),
}));

const DEFAULT_CATEGORIES = [
  {
    id: "cat-reading",
    name: "Reading",
    color: "#22c55e",
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    mangaCount: 2,
  },
  {
    id: "cat-completed",
    name: "Completed",
    color: "#3b82f6",
    sortOrder: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    mangaCount: 0,
  },
];

function renderSection() {
  return render(
    <ToastProvider>
      <CategoriesSection />
    </ToastProvider>,
  );
}

beforeEach(() => {
  mocks.categoryState = {
    data: DEFAULT_CATEGORIES,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  };
  mocks.createMutate.mockReset();
  mocks.updateMutate.mockReset();
  mocks.updateMutateAsync.mockReset().mockResolvedValue(undefined);
  mocks.deleteMutate.mockReset();
});

describe("CategoriesSection", () => {
  it("lists categories with manga counts, order and color", () => {
    renderSection();

    expect(screen.getByText("Reading")).toBeTruthy();
    expect(screen.getByText("Order 1")).toBeTruthy();
    expect(screen.getByText("Order 2")).toBeTruthy();
    expect(screen.getByText("2 manga")).toBeTruthy();
    expect(screen.getAllByText("#22c55e").length).toBeGreaterThan(0);
  });

  it("creates a category with a trimmed, validated name", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "New Category" }));

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "  Favorites  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));

    expect(mocks.createMutate).toHaveBeenCalledTimes(1);
    expect(mocks.createMutate.mock.calls[0]?.[0]).toEqual({
      name: "Favorites",
      color: "#6366f1",
    });
  });

  it("shows an error for empty and duplicate names", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "New Category" }));
    const nameInput = screen.getByLabelText("Name");

    fireEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(screen.getByText("Category name is required.")).toBeTruthy();
    expect(mocks.createMutate).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: "reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));

    expect(
      screen.getByText("A category with this name already exists."),
    ).toBeTruthy();
    expect(mocks.createMutate).not.toHaveBeenCalled();
  });

  it("renames a category", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Edit Reading" }));
    const nameInput = screen.getByLabelText("Name");
    expect((nameInput as HTMLInputElement).value).toBe("Reading");

    fireEvent.change(nameInput, { target: { value: "Currently Reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mocks.updateMutate).toHaveBeenCalledTimes(1);
    expect(mocks.updateMutate.mock.calls[0]?.[0]).toEqual({
      id: "cat-reading",
      name: "Currently Reading",
      color: "#22c55e",
    });
  });

  it("confirms deletion and warns that manga are preserved", () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Delete Reading" }));

    expect(
      screen.getByText(/This removes the category from 2 manga/),
    ).toBeTruthy();
    expect(
      screen.getByText(/The manga and their chapters are not deleted/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete category" }));

    expect(mocks.deleteMutate).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMutate.mock.calls[0]?.[0]).toBe("cat-reading");
  });

  it("reorders categories by moving one position", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Move Completed up" }));

    await waitFor(() => {
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        id: "cat-completed",
        sortOrder: 0,
      });
      expect(mocks.updateMutateAsync).toHaveBeenCalledWith({
        id: "cat-reading",
        sortOrder: 1,
      });
    });
  });

  it("renders loading, error with retry, and empty states", () => {
    mocks.categoryState = {
      ...mocks.categoryState,
      data: [],
      isLoading: true,
    };
    const { unmount } = renderSection();
    expect(screen.getByLabelText("Loading categories")).toBeTruthy();
    unmount();

    mocks.categoryState = {
      ...mocks.categoryState,
      isLoading: false,
      isError: true,
      error: new Error("Network down"),
    };
    const errorRender = renderSection();
    expect(screen.getByText("Network down")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.categoryState.refetch).toHaveBeenCalled();
    errorRender.unmount();

    mocks.categoryState = {
      ...mocks.categoryState,
      isError: false,
      error: null,
      data: [],
    };
    renderSection();
    expect(screen.getByText("No categories yet")).toBeTruthy();
  });
});
