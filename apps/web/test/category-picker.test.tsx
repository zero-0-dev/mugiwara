import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CategoryPicker } from "../src/components/CategoryPicker";
import { ToastProvider } from "../src/components/Toast";

const mocks = vi.hoisted(() => ({
  addMutate: vi.fn(),
  removeMutate: vi.fn(),
  assigned: [] as Array<Record<string, unknown>>,
}));

vi.mock("../src/api/hooks", () => ({
  useCategories: () => ({
    data: [
      {
        id: "cat-reading",
        name: "Reading",
        color: "#22c55e",
        sortOrder: 0,
        createdAt: "2024-01-01T00:00:00.000Z",
        mangaCount: 1,
      },
      {
        id: "cat-completed",
        name: "Completed",
        color: "#3b82f6",
        sortOrder: 1,
        createdAt: "2024-01-01T00:00:00.000Z",
        mangaCount: 0,
      },
    ],
    isLoading: false,
  }),
  useMangaCategories: () => ({
    data: mocks.assigned,
    isLoading: false,
  }),
  useAddMangaToCategory: () => ({
    mutate: mocks.addMutate,
    isPending: false,
  }),
  useRemoveMangaFromCategory: () => ({
    mutate: mocks.removeMutate,
    isPending: false,
  }),
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
});

beforeEach(() => {
  mocks.addMutate.mockReset();
  mocks.removeMutate.mockReset();
  mocks.assigned = [
    {
      id: "cat-reading",
      name: "Reading",
      color: "#22c55e",
      sortOrder: 0,
      createdAt: "2024-01-01T00:00:00.000Z",
    },
  ];
});

function renderPicker() {
  return render(
    <ToastProvider>
      <CategoryPicker mangaId="manga-1" />
    </ToastProvider>,
  );
}

function openCategoryMenu() {
  const trigger = screen.getByRole("button", { name: "Assign category" });
  trigger.focus();
  // jsdom has no PointerEvent implementation, so open the Radix menu through
  // its keyboard path instead of a synthetic pointer sequence.
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

describe("CategoryPicker", () => {
  it("shows assigned categories and unassigns them", () => {
    renderPicker();

    expect(screen.getByText("Reading")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove from Reading" }),
    );

    expect(mocks.removeMutate).toHaveBeenCalledTimes(1);
    expect(mocks.removeMutate.mock.calls[0]?.[0]).toBe("cat-reading");
  });

  it("assigns an available category from the dropdown", async () => {
    renderPicker();
    openCategoryMenu();

    const item = await screen.findByText("Completed");
    fireEvent.click(item);

    expect(mocks.addMutate).toHaveBeenCalledTimes(1);
    expect(mocks.addMutate.mock.calls[0]?.[0]).toBe("cat-completed");
  });

  it("keeps the dropdown inside a scrollable, viewport-bounded panel", async () => {
    renderPicker();
    openCategoryMenu();

    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("max-h-");
    expect(menu.className).toContain("overflow-y-auto");
    expect(menu.className).toContain("calc(100vw-1.5rem)");
  });

  it("closes the dropdown when clicking outside", async () => {
    renderPicker();
    openCategoryMenu();

    await screen.findByText("Completed");
    fireEvent.pointerDown(document.body, {
      button: 0,
      pointerType: "mouse",
    });

    await waitFor(() => {
      expect(screen.queryByText("Completed")).toBeNull();
    });
  });
});
