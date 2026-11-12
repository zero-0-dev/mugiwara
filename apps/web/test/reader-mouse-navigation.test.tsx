import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiClientProvider } from "../src/api/context";
import { Reader } from "../src/components/Reader";

const mocks = vi.hoisted(() => ({
  mode: "ltr" as "rtl" | "ltr" | "vertical",
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

  render(
    <ApiClientProvider baseUrl="">
      <Reader
        mangaId="m1"
        chapterId="c2"
        onBack={vi.fn()}
        onNextChapter={onNextChapter}
        onPrevChapter={onPrevChapter}
      />
    </ApiClientProvider>,
  );

  return { onNextChapter, onPrevChapter };
}

/** jsdom has no PointerEvent, so build one from MouseEvent. */
function dispatchPointer(
  target: Element,
  type: "pointerdown" | "pointerup",
  button: number,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button,
    clientX: 300,
    clientY: 300,
  });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

function mouseClick(target: Element, button: number) {
  // Flush each native event separately, like a real mouse does; otherwise two
  // clicks batched in one act() would both read the same current page.
  act(() => dispatchPointer(target, "pointerdown", button));
  act(() => dispatchPointer(target, "pointerup", button));
}

function movePointer(target: Element, clientX: number, clientY: number) {
  const event = new MouseEvent("pointermove", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
}

describe("Reader desktop mouse navigation", () => {
  beforeEach(() => {
    mocks.mode = "ltr";
    // jsdom does not implement scrolling.
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollBy = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances on left click and goes back on right click", async () => {
    renderReader();

    const firstPage = await screen.findByLabelText("Page 1");
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );

    mouseClick(firstPage, 0);
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );

    fireEvent.contextMenu(screen.getByLabelText("Page 2"), { button: 2 });
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );
  });

  it("uses the same button mapping in RTL", async () => {
    mocks.mode = "rtl";
    renderReader();

    const firstPage = await screen.findByLabelText("Page 1");
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );

    mouseClick(firstPage, 0);
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );

    fireEvent.contextMenu(screen.getByLabelText("Page 2"), { button: 2 });
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );
  });

  it("moves to the next chapter from the last page", async () => {
    const { onNextChapter } = renderReader();

    const lastPage = await screen.findByLabelText("Page 3");
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );

    // Two left clicks reach the last page, a third one crosses the boundary.
    mouseClick(screen.getByLabelText("Page 1"), 0);
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );
    mouseClick(screen.getByLabelText("Page 2"), 0);
    await waitFor(() =>
      expect(screen.getAllByText("3 / 3").length).toBeGreaterThan(0),
    );
    mouseClick(lastPage, 0);

    await waitFor(() => expect(onNextChapter).toHaveBeenCalledTimes(1));
  });

  it("advances twice on a double click instead of zooming", async () => {
    renderReader();

    const firstPage = await screen.findByLabelText("Page 1");
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );

    mouseClick(firstPage, 0);
    mouseClick(firstPage, 0);

    await waitFor(() =>
      expect(screen.getAllByText("3 / 3").length).toBeGreaterThan(0),
    );
    expect(screen.queryByLabelText("Reset zoom")).toBeNull();
  });

  it("zooms with the mouse wheel", async () => {
    renderReader();

    await screen.findByLabelText("Page 1");
    const reader = document.querySelector<HTMLElement>(".reader");
    expect(reader).toBeTruthy();

    fireEvent.wheel(reader!, {
      deltaY: -120,
      clientX: 300,
      clientY: 300,
    });

    expect(await screen.findByLabelText("Reset zoom")).toBeTruthy();
    expect(screen.getByLabelText("Page 1").style.transform).toContain("scale(");

    // Wheeling back down returns to the default zoom.
    fireEvent.wheel(reader!, {
      deltaY: 400,
      clientX: 300,
      clientY: 300,
    });

    await waitFor(() =>
      expect(screen.queryByLabelText("Reset zoom")).toBeNull(),
    );
    expect(screen.getByLabelText("Page 1").style.transform).toBe("");
  });

  it("reveals the controls only at the top and bottom edge", () => {
    vi.useFakeTimers();
    renderReader();

    const reader = document.querySelector<HTMLElement>(".reader")!;
    reader.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        right: 1024,
        bottom: 800,
        width: 1024,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const topControls = document.querySelector<HTMLElement>(".top-controls")!;
    expect(topControls.className).toContain("opacity-100");

    // Controls fade out after their timeout.
    act(() => vi.advanceTimersByTime(3000));
    expect(topControls.className).toContain("opacity-0");

    // Moving over the page itself must not pop them back up over the content.
    act(() => movePointer(reader, 400, 400));
    expect(topControls.className).toContain("opacity-0");

    // Reaching the top or bottom edge brings them back on purpose.
    act(() => movePointer(reader, 400, 790));
    expect(topControls.className).toContain("opacity-100");
  });
});
