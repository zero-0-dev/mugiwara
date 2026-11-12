import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiClientProvider } from "../src/api/context";
import { Reader } from "../src/components/Reader";

const mocks = vi.hoisted(() => ({
  mode: "vertical" as "rtl" | "ltr" | "vertical",
}));

vi.mock("../src/api/hooks", () => ({
  useChapterPages: () => ({
    data: [
      { index: 0, url: "/page-0.jpg", width: 800, height: 1200 },
      { index: 1, url: "/page-1.jpg", width: 800, height: 1200 },
      { index: 2, url: "/page-2.jpg", width: 800, height: 1200 },
    ],
    isLoading: false,
  }),
  useChapterProgress: () => ({ data: null, isLoading: false }),
  useManga: () => ({ data: { id: "m1", title: "One Piece" } }),
  useChapters: () => ({
    data: [
      { id: "c1", chapterId: "1", title: "Chapter 1" },
      { id: "c2", chapterId: "2", title: "Chapter 2" },
      { id: "c3", chapterId: "3", title: "Chapter 3" },
    ],
  }),
  useReadingMode: () => ({ data: { mode: mocks.mode } }),
  useSettings: () => ({ data: {} }),
  useUpdateChapterProgress: () => ({ mutate: vi.fn() }),
  useSetReadingMode: () => ({ mutate: vi.fn() }),
}));

function renderReader() {
  const onNextChapter = vi.fn();
  const onPrevChapter = vi.fn();
  const onBack = vi.fn();

  render(
    <ApiClientProvider baseUrl="">
      <Reader
        mangaId="m1"
        chapterId="c2"
        onBack={onBack}
        onNextChapter={onNextChapter}
        onPrevChapter={onPrevChapter}
      />
    </ApiClientProvider>,
  );

  return { onNextChapter, onPrevChapter, onBack };
}

describe("Reader vertical chapter navigation", () => {
  beforeEach(() => {
    mocks.mode = "vertical";
    // jsdom does not implement scrolling.
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollBy = vi.fn();
  });

  it("uses the footer buttons to move between chapters", async () => {
    const { onNextChapter, onPrevChapter } = renderReader();

    const next = await screen.findByRole("button", { name: "Next chapter" });
    const prev = screen.getByRole("button", { name: "Previous chapter" });

    fireEvent.click(next);
    expect(onNextChapter).toHaveBeenCalledTimes(1);
    expect(onPrevChapter).not.toHaveBeenCalled();

    fireEvent.click(prev);
    expect(onPrevChapter).toHaveBeenCalledTimes(1);
  });

  it("places chapter buttons around the images", async () => {
    const { onNextChapter, onPrevChapter } = renderReader();

    const prev = await screen.findByRole("button", {
      name: "Go to previous chapter",
    });
    const next = screen.getByRole("button", { name: "Go to next chapter" });

    // The previous link sits before the first image and the next link after
    // the last one, so both are reachable by scrolling the story itself.
    const firstPage = screen.getByLabelText("Page 1");
    const lastPage = screen.getByLabelText("Page 3");
    expect(
      prev.compareDocumentPosition(firstPage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      lastPage.compareDocumentPosition(next) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(next);
    expect(onNextChapter).toHaveBeenCalledTimes(1);
    fireEvent.click(prev);
    expect(onPrevChapter).toHaveBeenCalledTimes(1);
  });

  it("continues to the next chapter on an extra swipe past the bottom", async () => {
    const { onNextChapter } = renderReader();

    const scroller = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        ".reader-vertical-scroller",
      );
      if (!element) throw new Error("vertical scroller not mounted");
      return element;
    });

    // jsdom reports zero scroll metrics, so the reader is both at the top and
    // at the bottom; a finger moving up means "continue past the bottom".
    fireEvent.touchStart(scroller, {
      touches: [{ clientX: 200, clientY: 400 }],
      changedTouches: [{ clientX: 200, clientY: 400 }],
    });
    fireEvent.touchEnd(scroller, {
      touches: [],
      changedTouches: [{ clientX: 206, clientY: 300 }],
    });

    expect(onNextChapter).toHaveBeenCalledTimes(1);
  });

  it("continues to the previous chapter on an extra swipe past the top", async () => {
    const { onPrevChapter } = renderReader();

    const scroller = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        ".reader-vertical-scroller",
      );
      if (!element) throw new Error("vertical scroller not mounted");
      return element;
    });

    fireEvent.touchStart(scroller, {
      touches: [{ clientX: 200, clientY: 300 }],
      changedTouches: [{ clientX: 200, clientY: 300 }],
    });
    fireEvent.touchEnd(scroller, {
      touches: [],
      changedTouches: [{ clientX: 206, clientY: 400 }],
    });

    expect(onPrevChapter).toHaveBeenCalledTimes(1);
  });
});
