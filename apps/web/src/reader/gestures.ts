/**
 * Pure gesture/layout helpers for the reader.
 *
 * The paged reader is a single LTR scroll container with CSS scroll-snap.
 * RTL reading is implemented by reversing the display order of the slides,
 * which keeps the native scroll maths identical on every engine. These
 * helpers are the only place that knows about that reversal, so the DOM code
 * never has to reason about negative `scrollLeft` values in WebKit.
 */

export type ReaderDirection = "ltr" | "rtl";
export type ReaderMode = ReaderDirection | "vertical";
export type TapAction = "prev" | "next" | "controls";
export type ChapterAction = "prev" | "next";
export type SlideKind = "prev" | "page" | "next";

export interface SlideDescriptor {
  kind: SlideKind;
  /** Zero-based content page index. Undefined for chapter sentinels. */
  pageIndex?: number;
  key: string;
}

export interface SlideLayout {
  /** Number of image pages in the chapter. */
  pageCount: number;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
  direction: ReaderDirection;
}

/** Fraction of the viewport width that counts as a left/right tap zone. */
export const TAP_EDGE_FRACTION = 0.3;
/** Horizontal distance required before an edge swipe changes chapter. */
export const CHAPTER_SWIPE_THRESHOLD_PX = 72;
/** Maximum delay between two taps to count as a double tap. */
export const DOUBLE_TAP_MS = 280;
/** Maximum finger movement (CSS px) that still counts as a tap. */
export const TAP_MOVE_TOLERANCE_PX = 12;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function slideCountForLayout(layout: SlideLayout): number {
  return (
    layout.pageCount +
    (layout.hasPrevChapter ? 1 : 0) +
    (layout.hasNextChapter ? 1 : 0)
  );
}

/** Slides in reading order: previous sentinel, pages, next sentinel. */
export function buildLogicalSlides(layout: SlideLayout): SlideDescriptor[] {
  const slides: SlideDescriptor[] = [];
  if (layout.hasPrevChapter) {
    slides.push({ kind: "prev", key: "prev-chapter" });
  }
  for (let pageIndex = 0; pageIndex < layout.pageCount; pageIndex += 1) {
    slides.push({ kind: "page", pageIndex, key: `page-${pageIndex}` });
  }
  if (layout.hasNextChapter) {
    slides.push({ kind: "next", key: "next-chapter" });
  }
  return slides;
}

/**
 * Slide order as laid out left-to-right in the scroll container. RTL reverses
 * the logical order so page 1 sits at the right edge and swiping right (finger
 * moves right, `scrollLeft` decreases) advances the page.
 */
export function toDisplaySlides(
  logicalSlides: SlideDescriptor[],
  direction: ReaderDirection,
): SlideDescriptor[] {
  return direction === "rtl" ? [...logicalSlides].reverse() : logicalSlides;
}

export function logicalIndexToDisplayIndex(
  logicalIndex: number,
  slideCount: number,
  direction: ReaderDirection,
): number {
  return direction === "rtl" ? slideCount - 1 - logicalIndex : logicalIndex;
}

export function displayIndexToLogicalIndex(
  displayIndex: number,
  slideCount: number,
  direction: ReaderDirection,
): number {
  return direction === "rtl" ? slideCount - 1 - displayIndex : displayIndex;
}

/**
 * Maps the settled display slide to a content page index. Returns null when
 * the slide is a chapter sentinel.
 */
export function pageIndexForDisplayIndex(
  displayIndex: number,
  layout: SlideLayout,
  slideCount = slideCountForLayout(layout),
): number | null {
  if (slideCount <= 0) return null;
  const clampedDisplay = clamp(displayIndex, 0, slideCount - 1);
  const logical = displayIndexToLogicalIndex(
    clampedDisplay,
    slideCount,
    layout.direction,
  );
  const pageIndex = logical - (layout.hasPrevChapter ? 1 : 0);
  if (pageIndex < 0 || pageIndex >= layout.pageCount) return null;
  return pageIndex;
}

/** Returns the chapter action represented by a display slide, if any. */
export function chapterActionForDisplayIndex(
  displayIndex: number,
  layout: SlideLayout,
  slideCount = slideCountForLayout(layout),
): ChapterAction | null {
  if (slideCount <= 0) return null;
  const clampedDisplay = clamp(displayIndex, 0, slideCount - 1);
  const logical = displayIndexToLogicalIndex(
    clampedDisplay,
    slideCount,
    layout.direction,
  );

  if (layout.hasPrevChapter && logical === 0) return "prev";
  if (layout.hasNextChapter && logical === slideCount - 1) return "next";
  return null;
}

/** Display index for a content page, honouring RTL reversal. */
export function displayIndexForPage(
  pageIndex: number,
  layout: SlideLayout,
  slideCount = slideCountForLayout(layout),
): number {
  const clampedPage = clamp(pageIndex, 0, Math.max(0, layout.pageCount - 1));
  const logical = clampedPage + (layout.hasPrevChapter ? 1 : 0);
  return logicalIndexToDisplayIndex(logical, slideCount, layout.direction);
}

/** Which tap zone was hit, in reading direction. */
export function resolveTapZone(
  fraction: number,
  direction: ReaderDirection,
): TapAction {
  if (fraction < TAP_EDGE_FRACTION) {
    return direction === "rtl" ? "next" : "prev";
  }
  if (fraction > 1 - TAP_EDGE_FRACTION) {
    return direction === "rtl" ? "prev" : "next";
  }
  return "controls";
}

/**
 * Resolves a horizontal swipe at the top/bottom of the vertical reader into a
 * chapter action. The swipe must be mostly horizontal and, like page turns,
 * follows the reading direction: in LTR a left swipe advances, in RTL a right
 * swipe advances.
 */
export function resolveEdgeSwipe(input: {
  dx: number;
  dy: number;
  atTop: boolean;
  atBottom: boolean;
  direction: ReaderDirection;
  threshold?: number;
}): ChapterAction | null {
  const {
    dx,
    dy,
    atTop,
    atBottom,
    direction,
    threshold = CHAPTER_SWIPE_THRESHOLD_PX,
  } = input;

  if (!atTop && !atBottom) return null;
  if (Math.abs(dx) < threshold) return null;
  // Reject gestures that are mostly vertical: they belong to webtoon scrolling.
  if (Math.abs(dx) <= Math.abs(dy) * 1.2) return null;

  const forward = direction === "rtl" ? dx > 0 : dx < 0;
  if (atBottom && forward) return "next";
  if (atTop && !forward) return "prev";
  return null;
}

/**
 * Resolves a vertical swipe that continues past the top/bottom of the vertical
 * reader into a chapter action. It only fires when the scroller is already at
 * that edge, so a normal webtoon scroll is never stolen: once the chapter runs
 * out, an extra swipe in the same direction advances to the neighbouring
 * chapter. A finger moving up continues the downward scroll into the next
 * chapter; a finger moving down continues the upward scroll into the previous
 * one.
 */
export function resolveScrollEdgeSwipe(input: {
  dx: number;
  dy: number;
  atTop: boolean;
  atBottom: boolean;
  threshold?: number;
}): ChapterAction | null {
  const {
    dx,
    dy,
    atTop,
    atBottom,
    threshold = CHAPTER_SWIPE_THRESHOLD_PX,
  } = input;

  if (!atTop && !atBottom) return null;
  if (Math.abs(dy) < threshold) return null;
  // Reject gestures that are mostly horizontal: they belong to the horizontal
  // chapter edge swipes.
  if (Math.abs(dy) <= Math.abs(dx) * 1.2) return null;

  if (atBottom && dy < 0) return "next";
  if (atTop && dy > 0) return "prev";
  return null;
}

export interface TapPoint {
  x: number;
  y: number;
  time: number;
}

/** True when two consecutive tap points form a double tap. */
export function isDoubleTap(
  previous: TapPoint | null,
  current: TapPoint,
  maxDelayMs = DOUBLE_TAP_MS,
  maxDistancePx = 30,
): boolean {
  if (!previous) return false;
  if (current.time - previous.time > maxDelayMs) return false;
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  return Math.hypot(dx, dy) <= maxDistancePx;
}

/**
 * Debounces scroll events into a single "settled" callback. `scrollend` is not
 * available in every WebView, so the reader uses this as a fallback and as a
 * guard against duplicate `scrollend` + timer emissions.
 */
export class SettleDebouncer<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly delayMs: number,
    private readonly onSettle: (value: T) => void,
  ) {}

  push(value: T): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onSettle(value);
    }, this.delayMs);
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  get pending(): boolean {
    return this.timer !== null;
  }
}
