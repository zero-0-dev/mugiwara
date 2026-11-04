import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiClientProvider } from "../src/api/context";
import type { ComponentProps } from "react";
import { SearchStep } from "../src/components/add-manga/SearchStep";

const result = {
  sourceMangaId: "/srv/manga/My Manga",
  title: "My Manga",
};

function renderSearchStep(overrides: Partial<ComponentProps<typeof SearchStep>> = {}) {
  const props: ComponentProps<typeof SearchStep> = {
    isLocal: true,
    searchQuery: "/srv/manga/My Manga",
    searchResults: [],
    isSearching: false,
    hasSearched: true,
    onQueryChange: vi.fn(),
    onSearchImmediate: vi.fn(),
    onClear: vi.fn(),
    onBrowse: vi.fn(),
    onResultClick: vi.fn(),
    localHint: "Enter a folder path on the server machine, not this browser's device.",
    showKeyboardHints: true,
    ...overrides,
  };
  render(
    <ApiClientProvider baseUrl="">
      <SearchStep {...props} />
    </ApiClientProvider>,
  );
  return props;
}

describe("SearchStep local import behaviour", () => {
  it("keeps the local path field editable on web and tells the user it is a server path", () => {
    renderSearchStep();

    const input = screen.getByLabelText("Local folder path");
    expect((input as HTMLInputElement).readOnly).toBe(false);
    expect(screen.getByText(/server machine, not this browser's device/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find manga" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Browse/ })).toBeNull();
  });

  it("does not say Browse when there is no native picker", () => {
    const props = renderSearchStep({ nativeFolderPicker: false });

    fireEvent.click(screen.getByRole("button", { name: "Enter server path" }));
    expect(props.onBrowse).toHaveBeenCalled();
    expect(screen.queryByText("Browse…")).toBeNull();
  });

  it("shows Browse only when a native folder picker is available", () => {
    renderSearchStep({ nativeFolderPicker: true });

    expect(screen.getByRole("button", { name: "Browse…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Find manga" })).toBeNull();
  });

  it("submits the path on Enter", () => {
    const props = renderSearchStep();
    fireEvent.keyDown(screen.getByLabelText("Local folder path"), { key: "Enter" });
    expect(props.onSearchImmediate).toHaveBeenCalledTimes(1);
  });

  it("hides Enter-to-search copy on touch-only devices", () => {
    renderSearchStep({ showKeyboardHints: false });

    expect(screen.queryByText(/Press Enter to search/i)).toBeNull();
    expect(screen.getAllByText(/server machine/i).length).toBeGreaterThan(0);
  });

  it("renders an actionable invalid-path error", () => {
    renderSearchStep({
      searchResults: [],
      searchError: 'Folder not found on the server: "/missing". Check the path.',
    });

    expect(screen.getByRole("alert").textContent).toContain("Folder not found");
  });

  it("renders a valid local path result and lets the user select it", () => {
    const props = renderSearchStep({ searchResults: [result] });

    expect(screen.getByText("My Manga")).toBeTruthy();
    fireEvent.click(screen.getByText("My Manga"));
    expect(props.onResultClick).toHaveBeenCalledWith(result);
  });

  it("explains an empty local folder result", () => {
    renderSearchStep({ searchResults: [] });

    expect(screen.getByText(/No manga found at/)).toBeTruthy();
    expect(screen.getByText(/chapter subfolders, image files, or CBZ\/ZIP archives/i)).toBeTruthy();
  });
});
