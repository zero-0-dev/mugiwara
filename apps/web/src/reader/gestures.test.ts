import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SettleDebouncer,
  buildLogicalSlides,
  chapterActionForDisplayIndex,
  displayIndexForPage,
  isDoubleTap,
  pageIndexForDisplayIndex,
  resolveEdgeSwipe,
  resolveScrollEdgeSwipe,
  resolveTapZone,
  slideCountForLayout,
  toDisplaySlides,
  type SlideLayout,
} from "./gestures";

function layout(overrides: Partial<SlideLayout> = {}): SlideLayout {
  return {
    pageCount: 4,
    hasPrevChapter: true,
    hasNextChapter: true,
    direction: "ltr",
    ...overrides,
  };
}

describe("slide layout", () => {
  it("adds sentinels only when neighbouring chapters exist", () => {
    expect(
      buildLogicalSlides(layout({ pageCount: 3 })).map((slide) => slide.kind),
    ).toEqual(["prev", "page", "page", "page", "next"]);

    expect(
      buildLogicalSlides(
        layout({ pageCount: 2, hasPrevChapter: false, hasNextChapter: false }),
      ).map((slide) => slide.kind),
    ).toEqual(["page", "page"]);
  });

  it("reverses only the display order for RTL", () => {
    const logical = buildLogicalSlides(layout({ pageCount: 3 }));
    expect(toDisplaySlides(logical, "ltr").map((slide) => slide.key)).toEqual([
      "prev-chapter",
      "page-0",
      "page-1",
      "page-2",
      "next-chapter",
    ]);
    expect(toDisplaySlides(logical, "rtl").map((slide) => slide.key)).toEqual([
      "next-chapter",
      "page-2",
      "page-1",
      "page-0",
      "prev-chapter",
    ]);
  });
});

describe("RTL page index mapping", () => {
  it("maps every page to a display index and back in both directions", () => {
    for (const direction of ["ltr", "rtl"] as const) {
      const current = layout({ pageCount: 5, direction });
      const count = slideCountForLayout(current);
      for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
        const displayIndex = displayIndexForPage(pageIndex, current, count);
        expect(pageIndexForDisplayIndex(displayIndex, current, count)).toBe(
          pageIndex,
        );
      }
    }
  });

  it("puts page 1 at the right edge in RTL", () => {
    const rtl = layout({ pageCount: 4, direction: "rtl" });
    const count = slideCountForLayout(rtl);
    // Display order: next, p3, p2, p1, p0, prev.
    expect(displayIndexForPage(0, rtl, count)).toBe(4);
    expect(displayIndexForPage(3, rtl, count)).toBe(1);
  });

  it("reports the correct page number for RTL settles", () => {
    const rtl = layout({ pageCount: 4, direction: "rtl" });
    const count = slideCountForLayout(rtl);
    const pages = Array.from({ length: count }, (_, displayIndex) =>
      pageIndexForDisplayIndex(displayIndex, rtl, count),
    );
    // left-to-right: next, p3, p2, p1, p0, prev
    expect(pages).toEqual([null, 3, 2, 1, 0, null]);
  });

  it("detects chapter sentinels at the correct physical ends", () => {
    const ltr = layout({ direction: "ltr" });
    const ltrCount = slideCountForLayout(ltr);
    expect(chapterActionForDisplayIndex(0, ltr, ltrCount)).toBe("prev");
    expect(chapterActionForDisplayIndex(ltrCount - 1, ltr, ltrCount)).toBe(
      "next",
    );

    const rtl = layout({ direction: "rtl" });
    const rtlCount = slideCountForLayout(rtl);
    // RTL is reversed: the first display slide is the next-chapter sentinel.
    expect(chapterActionForDisplayIndex(0, rtl, rtlCount)).toBe("next");
    expect(chapterActionForDisplayIndex(rtlCount - 1, rtl, rtlCount)).toBe(
      "prev",
    );
  });

  it("has no sentinel when a neighbour is unavailable", () => {
    const onlyNext = layout({ pageCount: 3, hasPrevChapter: false });
    const count = slideCountForLayout(onlyNext);
    expect(chapterActionForDisplayIndex(0, onlyNext, count)).toBeNull();
    expect(chapterActionForDisplayIndex(count - 1, onlyNext, count)).toBe(
      "next",
    );
  });
});

describe("tap zones", () => {
  it("respects reading direction", () => {
    expect(resolveTapZone(0.1, "ltr")).toBe("prev");
    expect(resolveTapZone(0.9, "ltr")).toBe("next");
    expect(resolveTapZone(0.1, "rtl")).toBe("next");
    expect(resolveTapZone(0.9, "rtl")).toBe("prev");
    expect(resolveTapZone(0.5, "ltr")).toBe("controls");
    expect(resolveTapZone(0.5, "rtl")).toBe("controls");
  });
});

describe("vertical edge swipes", () => {
  const base = { atTop: true, atBottom: false, direction: "ltr" as const };

  it("requires a horizontal gesture past the threshold", () => {
    expect(resolveEdgeSwipe({ ...base, dx: 40, dy: 5 })).toBeNull();
    expect(
      resolveEdgeSwipe({ ...base, atTop: false, atBottom: true, dx: -80, dy: 5 }),
    ).toBe("next");
    expect(
      resolveEdgeSwipe({ ...base, dx: -80, dy: 70, atBottom: true, atTop: false }),
    ).toBeNull();
  });

  it("maps direction to the correct chapter end", () => {
    // At the top, a backwards swipe goes to the previous chapter.
    expect(resolveEdgeSwipe({ ...base, dx: 90, dy: 8 })).toBe("prev");
    expect(
      resolveEdgeSwipe({ ...base, atTop: false, atBottom: true, dx: -90, dy: 8 }),
    ).toBe("next");
    // RTL flips the physical direction.
    expect(
      resolveEdgeSwipe({ ...base, direction: "rtl", dx: 90, dy: 8 }),
    ).toBeNull();
    expect(
      resolveEdgeSwipe({
        ...base,
        direction: "rtl",
        atTop: false,
        atBottom: true,
        dx: 90,
        dy: 8,
      }),
    ).toBe("next");
    expect(
      resolveEdgeSwipe({ ...base, direction: "rtl", dx: -90, dy: 8 }),
    ).toBe("prev");
  });

  it("does nothing in the middle of the chapter", () => {
    expect(
      resolveEdgeSwipe({ ...base, atTop: false, atBottom: false, dx: 120, dy: 4 }),
    ).toBeNull();
  });
});

describe("vertical edge continuation swipes", () => {
  it("advances after the bottom is reached", () => {
    expect(
      resolveScrollEdgeSwipe({
        dx: 6,
        dy: -90,
        atTop: false,
        atBottom: true,
      }),
    ).toBe("next");
    expect(
      resolveScrollEdgeSwipe({
        dx: 6,
        dy: -40,
        atTop: false,
        atBottom: true,
      }),
    ).toBeNull();
  });

  it("goes back after the top is reached", () => {
    expect(
      resolveScrollEdgeSwipe({ dx: 6, dy: 90, atTop: true, atBottom: false }),
    ).toBe("prev");
  });

  it("does not steal normal scrolling in the middle of the chapter", () => {
    expect(
      resolveScrollEdgeSwipe({
        dx: 6,
        dy: -120,
        atTop: false,
        atBottom: false,
      }),
    ).toBeNull();
    expect(
      resolveScrollEdgeSwipe({ dx: 6, dy: 70, atTop: true, atBottom: false }),
    ).toBeNull();
  });

  it("ignores mostly horizontal gestures", () => {
    expect(
      resolveScrollEdgeSwipe({
        dx: -90,
        dy: 40,
        atTop: false,
        atBottom: true,
      }),
    ).toBeNull();
  });

  it("uses the swiped edge's direction", () => {
    // Swiping down at the bottom would scroll back up, so it is not "next".
    expect(
      resolveScrollEdgeSwipe({ dx: 6, dy: 90, atTop: false, atBottom: true }),
    ).toBeNull();
    // Swiping up at the top would scroll back down.
    expect(
      resolveScrollEdgeSwipe({ dx: 6, dy: -90, atTop: true, atBottom: false }),
    ).toBeNull();
  });
});

describe("double tap", () => {
  it("accepts two close taps in the window", () => {
    expect(
      isDoubleTap({ x: 10, y: 10, time: 100 }, { x: 14, y: 12, time: 300 }),
    ).toBe(true);
  });

  it("rejects slow or distant taps", () => {
    expect(
      isDoubleTap({ x: 10, y: 10, time: 100 }, { x: 14, y: 12, time: 500 }),
    ).toBe(false);
    expect(
      isDoubleTap({ x: 10, y: 10, time: 100 }, { x: 80, y: 12, time: 200 }),
    ).toBe(false);
    expect(isDoubleTap(null, { x: 1, y: 1, time: 1 })).toBe(false);
  });
});

describe("SettleDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits only the latest value after the quiet period", () => {
    const onSettle = vi.fn();
    const debouncer = new SettleDebouncer<number>(120, onSettle);

    debouncer.push(1);
    vi.advanceTimersByTime(60);
    debouncer.push(2);
    vi.advanceTimersByTime(60);
    debouncer.push(3);
    expect(onSettle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(119);
    expect(onSettle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith(3);
  });

  it("can be cancelled when the reader unmounts", () => {
    const onSettle = vi.fn();
    const debouncer = new SettleDebouncer<number>(100, onSettle);
    debouncer.push(1);
    debouncer.cancel();
    vi.advanceTimersByTime(500);
    expect(onSettle).not.toHaveBeenCalled();
    expect(debouncer.pending).toBe(false);
  });
});
