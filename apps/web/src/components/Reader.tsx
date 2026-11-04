import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Maximize, Minimize, RotateCcw, ZoomIn } from "lucide-react";
import type { PageInfo } from "@mugiwara-manga/types";
import { useApiClient } from "../api/context";
import {
  useChapterPages,
  useChapterProgress,
  useChapters,
  useManga,
  useReadingMode,
  useSetReadingMode,
  useSettings,
  useUpdateChapterProgress,
} from "../api/hooks";
import {
  buildLogicalSlides,
  chapterActionForDisplayIndex,
  clamp,
  displayIndexForPage,
  DOUBLE_TAP_MS,
  isDoubleTap,
  pageIndexForDisplayIndex,
  resolveEdgeSwipe,
  resolveTapZone,
  SettleDebouncer,
  toDisplaySlides,
  TAP_MOVE_TOLERANCE_PX,
  type ReaderDirection,
  type ReaderMode,
  type SlideDescriptor,
  type SlideLayout,
  type TapPoint,
} from "../reader/gestures";
import { useWakeLock } from "../reader/useWakeLock";
import { hapticPageTurn } from "../platform/haptics";
import { setSystemBarsHidden } from "../platform/systemBars";

interface ReaderProps {
  mangaId: string;
  chapterId: string;
  onBack: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  initialPage?: number;
  onInitialPageUsed?: () => void;
  onImmersiveChange?: (immersive: boolean) => void;
}

interface ZoomState {
  scale: number;
  originX: number;
  originY: number;
}

const DEFAULT_ZOOM: ZoomState = { scale: 1, originX: 50, originY: 50 };
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const PRELOAD_RADIUS = 2;
const SCROLL_SETTLE_MS = 140;
const FAST_SCROLL_MS = 90;
const CONTROLS_HIDE_MS = 3000;

function ReaderPage({
  src,
  pageNumber,
  eager,
  active,
  zoom,
  className = "",
  width,
  height,
}: {
  src?: string;
  pageNumber: number;
  eager: boolean;
  active: boolean;
  zoom: ZoomState;
  className?: string;
  width?: number;
  height?: number;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => {
    setStatus("loading");
  }, [src]);

  const zoomed = active && zoom.scale > 1;
  const imageStyle: React.CSSProperties = {};
  if (width && height) {
    // Reserve the page height before the image loads. This keeps vertical
    // scroll restoration accurate and prevents layout jumps.
    imageStyle.aspectRatio = `${width} / ${height}`;
  }
  if (zoomed) {
    imageStyle.transform = `scale(${zoom.scale})`;
    imageStyle.transformOrigin = `${zoom.originX}% ${zoom.originY}%`;
  }

  return (
    <div
      className={`page-frame ${className} ${status} ${zoomed ? "is-zoomed" : ""}`}
    >
      {status !== "error" && src ? (
        <img
          src={src}
          alt=""
          aria-label={`Page ${pageNumber}`}
          className={`manga-page ${className.includes("vertical") ? "vertical" : ""}`}
          width={width}
          height={height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          style={imageStyle}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      ) : null}
      {status === "loading" && active ? (
        <div className="page-loading" aria-live="polite">
          <div className="loading-spinner" />
          <span>Loading page {pageNumber}...</span>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="page-error" role="img">
          <span>Page {pageNumber} failed to load</span>
          <small>Try swiping back to it or reloading the chapter.</small>
        </div>
      ) : null}
    </div>
  );
}

function ChapterSentinel({ kind }: { kind: "prev" | "next" }) {
  return (
    <div className="chapter-sentinel">
      <div className="chapter-sentinel-arrow" aria-hidden="true">
        {kind === "prev" ? "\u2039" : "\u203a"}
      </div>
      <div className="chapter-sentinel-title">
        {kind === "prev" ? "Previous chapter" : "Next chapter"}
      </div>
      <p>Swipe to continue</p>
    </div>
  );
}

export function Reader({
  mangaId,
  chapterId,
  onBack,
  onNextChapter,
  onPrevChapter,
  initialPage,
  onInitialPageUsed,
  onImmersiveChange,
}: ReaderProps) {
  const api = useApiClient();
  const { data: pages = [] as PageInfo[], isLoading: pagesLoading } =
    useChapterPages(mangaId, chapterId);
  const { data: chapterProgress, isLoading: progressLoading } =
    useChapterProgress(mangaId, chapterId);
  const { data: manga } = useManga(mangaId);
  const { data: chapterList = [] } = useChapters(mangaId);
  const { data: serverReadingModeData } = useReadingMode(mangaId);
  const { data: serverSettings } = useSettings();
  const { mutate: saveProgress } = useUpdateChapterProgress(mangaId, chapterId);
  const setReadingModeMutation = useSetReadingMode(mangaId);

  const currentChapter = chapterList.find((chapter) => chapter.id === chapterId);
  const mangaTitle = manga?.title?.trim();
  const chapterTitle = currentChapter
    ? currentChapter.title?.trim() || `Chapter ${currentChapter.chapterId}`
    : undefined;

  const [currentPage, setCurrentPage] = useState(0);
  const [readingMode, setReadingMode] = useState<ReaderMode>("rtl");
  // Vertical reading has no intrinsic left/right direction. Remember the last
  // horizontal mode so edge swipes still match the reader's reading direction.
  const [verticalDirection, setVerticalDirection] =
    useState<ReaderDirection>("rtl");
  const [showControls, setShowControls] = useState(true);
  const [immersive, setImmersive] = useState(true);
  const [progressReady, setProgressReady] = useState(false);
  const [savedPageIndex, setSavedPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomState>(DEFAULT_ZOOM);
  const [modeEpoch, setModeEpoch] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const pagedRef = useRef<HTMLDivElement>(null);
  const verticalRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapterLockRef = useRef(false);
  const didInitialScroll = useRef(false);
  const initialPageRef = useRef<number | undefined>(initialPage);
  const pendingInitialScrollRef = useRef<number | null>(null);
  const previousModeRef = useRef<ReaderMode>(readingMode);
  const zoomRef = useRef(zoom);
  const preloadedImagesRef = useRef<HTMLImageElement[]>([]);
  const scrollAnimationRef = useRef<number | null>(null);

  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<TapPoint | null>(null);
  const pointerStartRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    originX: number;
    originY: number;
  } | null>(null);
  const suppressTapRef = useRef(false);
  const lastHapticPageRef = useRef(currentPage);

  zoomRef.current = zoom;
  const direction: ReaderDirection =
    readingMode === "rtl" || readingMode === "ltr"
      ? readingMode
      : verticalDirection;
  const hapticsEnabled =
    String(
      (serverSettings as Record<string, unknown> | undefined)?.[
        "reader.haptics"
      ] ?? "false",
    ) === "true";

  const layout = useMemo<SlideLayout>(
    () => ({
      pageCount: pages.length,
      hasPrevChapter: Boolean(onPrevChapter),
      hasNextChapter: Boolean(onNextChapter),
      direction,
    }),
    [pages.length, onPrevChapter, onNextChapter, direction],
  );

  const displaySlides = useMemo<SlideDescriptor[]>(
    () => toDisplaySlides(buildLogicalSlides(layout), direction),
    [layout, direction],
  );
  const slideCount = displaySlides.length;
  const paged = readingMode !== "vertical";

  useWakeLock(true);

  useEffect(() => {
    initialPageRef.current = initialPage;
  }, [initialPage]);

  useEffect(() => {
    if (serverReadingModeData?.mode) {
      setReadingMode(serverReadingModeData.mode as ReaderMode);
    }
  }, [serverReadingModeData]);

  useEffect(() => {
    const configured = (serverSettings as Record<string, unknown> | undefined)?.[
      "reading.defaultMode"
    ];
    if (configured === "rtl" || configured === "ltr") {
      setVerticalDirection(configured);
    }
  }, [serverSettings]);

  useEffect(() => {
    if (readingMode === "rtl" || readingMode === "ltr") {
      setVerticalDirection(readingMode);
    }
  }, [readingMode]);

  useEffect(() => {
    onImmersiveChange?.(immersive);
  }, [immersive, onImmersiveChange]);

  useEffect(() => {
    return () => onImmersiveChange?.(false);
  }, [onImmersiveChange]);

  useEffect(() => {
    void setSystemBarsHidden(immersive);
    return () => {
      void setSystemBarsHidden(false);
    };
  }, [immersive]);

  const cancelPendingTap = useCallback(() => {
    if (tapTimerRef.current !== null) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingTap();
      if (controlsTimeoutRef.current !== null) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [cancelPendingTap]);

  // Reset chapter-local state. Chapter navigation keeps this component
  // mounted, so this is the only place that knows a new chapter started.
  useEffect(() => {
    didInitialScroll.current = false;
    chapterLockRef.current = false;
    pendingInitialScrollRef.current = null;
    setProgressReady(false);
    setCurrentPage(0);
    setSavedPageIndex(null);
    setZoom(DEFAULT_ZOOM);
    lastHapticPageRef.current = 0;
    cancelPendingTap();
  }, [chapterId, cancelPendingTap]);

  // Restore either the explicit initial page (chapter navigation) or the
  // persisted reading progress, once pages and progress have loaded.
  useEffect(() => {
    if (
      pages.length === 0 ||
      pagesLoading ||
      progressLoading ||
      didInitialScroll.current
    ) {
      return;
    }

    didInitialScroll.current = true;
    let target = 0;
    const requested = initialPageRef.current;

    if (requested !== undefined) {
      target =
        requested === -1
          ? pages.length - 1
          : clamp(requested, 0, pages.length - 1);
      initialPageRef.current = undefined;
      onInitialPageUsed?.();
    } else if (chapterProgress?.pageNumber && chapterProgress.pageNumber > 1) {
      target = clamp(chapterProgress.pageNumber - 1, 0, pages.length - 1);
    }

    pendingInitialScrollRef.current = target;
    setCurrentPage(target);
    if (readingMode === "vertical") {
      setSavedPageIndex(target);
    }
    setProgressReady(true);
  }, [
    pages.length,
    pagesLoading,
    progressLoading,
    chapterProgress,
    readingMode,
    onInitialPageUsed,
  ]);

  // When the mode changes, preserve the current page in the new layout.
  useEffect(() => {
    if (previousModeRef.current === readingMode) return;
    previousModeRef.current = readingMode;
    setZoom(DEFAULT_ZOOM);

    if (readingMode === "vertical") {
      setSavedPageIndex(currentPage);
    } else {
      pendingInitialScrollRef.current = currentPage;
      setModeEpoch((value) => value + 1);
    }
  }, [readingMode, currentPage]);

  const stopScrollAnimation = useCallback(() => {
    if (scrollAnimationRef.current !== null) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  }, []);

  const animateScroll = useCallback(
    (element: HTMLElement, left: number, top: number) => {
      stopScrollAnimation();

      const reduceMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const startLeft = element.scrollLeft;
      const startTop = element.scrollTop;
      const deltaLeft = left - startLeft;
      const deltaTop = top - startTop;

      if (
        reduceMotion ||
        (Math.abs(deltaLeft) < 1 && Math.abs(deltaTop) < 1)
      ) {
        element.scrollTo({ left, top, behavior: "auto" });
        return;
      }

      const startedAt = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / FAST_SCROLL_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.scrollTo({
          left: startLeft + deltaLeft * eased,
          top: startTop + deltaTop * eased,
          behavior: "auto",
        });
        scrollAnimationRef.current =
          progress < 1 ? requestAnimationFrame(step) : null;
      };
      scrollAnimationRef.current = requestAnimationFrame(step);
    },
    [stopScrollAnimation],
  );

  const scrollToPage = useCallback(
    (pageIndex: number, behavior: ScrollBehavior = "smooth") => {
      const target = clamp(pageIndex, 0, Math.max(0, pages.length - 1));
      setCurrentPage(target);

      if (readingMode === "vertical") {
        const scroller = verticalRef.current;
        const element = scroller?.querySelector<HTMLElement>(
          `[data-page-index="${target}"]`,
        );
        if (scroller && element) {
          const top =
            element.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop;
          scroller.scrollTo({ top, behavior });
        }
        return;
      }

      const scroller = pagedRef.current;
      if (!scroller) return;
      const display = displayIndexForPage(target, layout, slideCount);
      const width = scroller.clientWidth || window.innerWidth;
      const left = display * width;
      if (behavior === "smooth") {
        animateScroll(scroller, left, scroller.scrollTop);
      } else {
        scroller.scrollTo({ left, behavior });
      }
    },
    [animateScroll, layout, pages.length, readingMode, slideCount],
  );

  // Apply the initial/reset position after the paged scroller exists.
  useLayoutEffect(() => {
    if (!paged || !progressReady) return;
    const target = pendingInitialScrollRef.current;
    if (target === null) return;
    pendingInitialScrollRef.current = null;

    const scroller = pagedRef.current;
    if (!scroller) return;
    const display = displayIndexForPage(target, layout, slideCount);
    const width = scroller.clientWidth || window.innerWidth;
    scroller.scrollTo({ left: display * width, behavior: "auto" });
  }, [paged, progressReady, modeEpoch, layout, slideCount]);

  // Keep the same page aligned after an orientation change or window resize.
  useEffect(() => {
    if (!paged || !progressReady) return;

    const handleResize = () => {
      const scroller = pagedRef.current;
      if (!scroller) return;
      const display = displayIndexForPage(currentPage, layout, slideCount);
      const width = scroller.clientWidth || window.innerWidth;
      scroller.scrollTo({ left: display * width, behavior: "auto" });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [paged, progressReady, currentPage, layout, slideCount]);

  // Vertical webtoon: restore the saved page once the frames exist.
  useLayoutEffect(() => {
    if (paged || savedPageIndex === null) return;
    const scroller = verticalRef.current;
    const element = scroller?.querySelector<HTMLElement>(
      `[data-page-index="${savedPageIndex}"]`,
    );
    if (!scroller || !element) return;
    const top =
      element.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    scroller.scrollTo({ top, behavior: "auto" });
    setSavedPageIndex(null);
  }, [paged, savedPageIndex, pages.length]);

  // Paged: only commit page/progress after the scroll settles.
  useEffect(() => {
    if (!paged) return;
    const scroller = pagedRef.current;
    if (!scroller) return;

    const settle = () => {
      const width = scroller.clientWidth || window.innerWidth;
      if (!width || slideCount === 0) return;

      const displayIndex = clamp(
        Math.round(scroller.scrollLeft / width),
        0,
        slideCount - 1,
      );
      const pageIndex = pageIndexForDisplayIndex(
        displayIndex,
        layout,
        slideCount,
      );

      if (pageIndex === null) {
        const action = chapterActionForDisplayIndex(
          displayIndex,
          layout,
          slideCount,
        );
        if (action && !chapterLockRef.current) {
          chapterLockRef.current = true;
          if (action === "prev") onPrevChapter?.();
          else onNextChapter?.();
        }
        return;
      }

      setCurrentPage((previous) => (previous === pageIndex ? previous : pageIndex));
    };

    const debouncer = new SettleDebouncer<number>(SCROLL_SETTLE_MS, settle);
    const handleScroll = () => debouncer.push(scroller.scrollLeft);
    const handleScrollEnd = () => {
      debouncer.cancel();
      settle();
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    scroller.addEventListener("scrollend", handleScrollEnd);

    return () => {
      debouncer.cancel();
      scroller.removeEventListener("scroll", handleScroll);
      scroller.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [paged, layout, slideCount, onPrevChapter, onNextChapter]);

  // Vertical: derive the current page from the frame crossing the viewport
  // centre, again only after scrolling settles.
  useEffect(() => {
    if (paged) return;
    const scroller = verticalRef.current;
    if (!scroller) return;

    const settle = () => {
      const frames = scroller.querySelectorAll<HTMLElement>(
        ".vertical-page-frame",
      );
      if (frames.length === 0) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const middle = scrollerRect.top + scrollerRect.height / 2;
      let pageIndex = 0;

      for (let index = 0; index < frames.length; index += 1) {
        const rect = frames[index]!.getBoundingClientRect();
        pageIndex = index;
        if (rect.top <= middle && rect.bottom >= middle) break;
        if (rect.top > middle) break;
      }

      setCurrentPage((previous) =>
        previous === pageIndex ? previous : pageIndex,
      );
    };

    const debouncer = new SettleDebouncer<number>(SCROLL_SETTLE_MS, settle);
    const handleScroll = () => debouncer.push(scroller.scrollTop);
    const handleScrollEnd = () => {
      debouncer.cancel();
      settle();
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    scroller.addEventListener("scrollend", handleScrollEnd);

    return () => {
      debouncer.cancel();
      scroller.removeEventListener("scroll", handleScroll);
      scroller.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [paged, pages.length]);

  // Vertical: horizontal edge swipes change chapter, but only at the very
  // top/bottom and only when the gesture is clearly horizontal.
  useEffect(() => {
    if (paged) return;
    const scroller = verticalRef.current;
    if (!scroller) return;

    let start: {
      x: number;
      y: number;
      atTop: boolean;
      atBottom: boolean;
    } | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) {
        start = null;
        return;
      }
      start = {
        x: touch.clientX,
        y: touch.clientY,
        atTop: scroller.scrollTop <= 2,
        atBottom:
          scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 2,
      };
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const gesture = start;
      start = null;
      if (!touch) return;

      const action = resolveEdgeSwipe({
        dx: touch.clientX - gesture.x,
        dy: touch.clientY - gesture.y,
        atTop: gesture.atTop,
        atBottom: gesture.atBottom,
        direction,
      });

      if (action === "prev") onPrevChapter?.();
      else if (action === "next") onNextChapter?.();
    };

    const handleTouchCancel = () => {
      start = null;
    };

    scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
    scroller.addEventListener("touchend", handleTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });

    return () => {
      scroller.removeEventListener("touchstart", handleTouchStart);
      scroller.removeEventListener("touchend", handleTouchEnd);
      scroller.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [paged, pages.length, direction, onPrevChapter, onNextChapter]);

  // Preload the current page and its neighbours so normal paging has no
  // blank flash. The browser cache serves the <img> tags from here.
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    for (let offset = -PRELOAD_RADIUS; offset <= PRELOAD_RADIUS; offset += 1) {
      const page = pages[currentPage + offset];
      if (!page) continue;
      const url = api.getAssetUrl(page.url);
      if (!url) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      images.push(image);
    }
    preloadedImagesRef.current = images;
  }, [api, pages, currentPage]);

  // Progress is saved only after the settled page changes.
  useEffect(() => {
    if (!progressReady || pages.length === 0) return;

    const timer = setTimeout(() => {
      saveProgress({
        pageNumber: clamp(currentPage, 0, pages.length - 1) + 1,
        totalPages: pages.length,
        isCompleted: currentPage >= pages.length - 1,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [currentPage, pages.length, progressReady, saveProgress]);

  useEffect(() => {
    if (!progressReady) return;
    if (lastHapticPageRef.current === currentPage) return;
    lastHapticPageRef.current = currentPage;
    if (hapticsEnabled) {
      void hapticPageTurn(true);
    }
  }, [currentPage, progressReady, hapticsEnabled]);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current !== null) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      controlsTimeoutRef.current = null;
      setShowControls(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    showControlsTemporarily();
    return () => {
      if (controlsTimeoutRef.current !== null) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };
  }, [showControlsTemporarily]);

  useEffect(() => stopScrollAnimation, [stopScrollAnimation]);

  const goToNextPage = useCallback(() => {
    if (readingMode === "vertical") {
      verticalRef.current?.scrollBy({
        top: window.innerHeight * 0.8,
        behavior: "smooth",
      });
      return;
    }
    if (currentPage < pages.length - 1) {
      scrollToPage(currentPage + 1);
    } else {
      onNextChapter?.();
    }
  }, [currentPage, onNextChapter, pages.length, readingMode, scrollToPage]);

  const goToPrevPage = useCallback(() => {
    if (readingMode === "vertical") {
      verticalRef.current?.scrollBy({
        top: -window.innerHeight * 0.8,
        behavior: "smooth",
      });
      return;
    }
    if (currentPage > 0) {
      scrollToPage(currentPage - 1);
    } else {
      onPrevChapter?.();
    }
  }, [currentPage, onPrevChapter, readingMode, scrollToPage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea")) return;

      if (readingMode === "vertical") {
        if (event.key === "ArrowDown" || event.key === " ") {
          event.preventDefault();
          goToNextPage();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          goToPrevPage();
        } else if (event.key === "Escape") {
          onBack();
        }
        return;
      }

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          if (readingMode === "rtl") goToPrevPage();
          else goToNextPage();
          break;
        case "ArrowLeft":
          event.preventDefault();
          if (readingMode === "rtl") goToNextPage();
          else goToPrevPage();
          break;
        case " ":
        case "ArrowDown":
          event.preventDefault();
          if (readingMode === "rtl") goToPrevPage();
          else goToNextPage();
          break;
        case "Escape":
          onBack();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextPage, goToPrevPage, onBack, readingMode]);

  const performTap = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if ((target as HTMLElement | null)?.closest?.(".reader-controls")) return;

      if (readingMode === "vertical") {
        showControlsTemporarily();
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const action = resolveTapZone(
        (clientX - rect.left) / rect.width,
        direction,
      );

      if (action === "controls") {
        showControlsTemporarily();
      } else if (action === "prev") {
        goToPrevPage();
      } else {
        goToNextPage();
      }
    },
    [direction, goToNextPage, goToPrevPage, readingMode, showControlsTemporarily],
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopScrollAnimation();
    if ((event.target as HTMLElement).closest(".reader-controls")) return;
    if (pinchRef.current) {
      pointerStartRef.current = null;
      return;
    }
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
      TAP_MOVE_TOLERANCE_PX
    ) {
      start.moved = true;
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;

    if (!start || start.moved || suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest(".reader-controls")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const point: TapPoint = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };

    if (isDoubleTap(lastTapRef.current, point)) {
      cancelPendingTap();
      lastTapRef.current = null;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const originX = clamp(
          ((event.clientX - rect.left) / rect.width) * 100,
          0,
          100,
        );
        const originY = clamp(
          ((event.clientY - rect.top) / rect.height) * 100,
          0,
          100,
        );
        setZoom((previous) =>
          previous.scale > 1
            ? DEFAULT_ZOOM
            : { scale: DOUBLE_TAP_ZOOM, originX, originY },
        );
      }
      return;
    }

    lastTapRef.current = point;
    const { clientX, clientY, target } = event;
    cancelPendingTap();
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      lastTapRef.current = null;
      performTap(clientX, clientY, target);
    }, DOUBLE_TAP_MS);
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    suppressTapRef.current = false;
  };

  // Two-finger pinch zoom. One-finger gestures stay native so scroll-snap
  // momentum and rubber-banding are untouched.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0]!.clientX - touches[1]!.clientX,
        touches[0]!.clientY - touches[1]!.clientY,
      );

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      suppressTapRef.current = true;
      cancelPendingTap();
      pointerStartRef.current = null;
      const rect = element.getBoundingClientRect();
      const midX =
        (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2;
      const midY =
        (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2;
      pinchRef.current = {
        distance: Math.max(1, distance(event.touches)),
        scale: zoomRef.current.scale,
        originX: clamp(((midX - rect.left) / rect.width) * 100, 0, 100),
        originY: clamp(((midY - rect.top) / rect.height) * 100, 0, 100),
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const nextScale = clamp(
        pinch.scale * (distance(event.touches) / pinch.distance),
        1,
        MAX_ZOOM,
      );
      setZoom({
        scale: nextScale,
        originX: pinch.originX,
        originY: pinch.originY,
      });
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinchRef.current = null;
        suppressTapRef.current = false;
      }
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd, { passive: true });
    element.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [cancelPendingTap, pages.length]);

  const resetZoom = () => setZoom(DEFAULT_ZOOM);

  const toggleImmersive = () => {
    const next = !immersive;
    setImmersive(next);

    if (next) {
      if (document.documentElement.requestFullscreen) {
        void document.documentElement.requestFullscreen().catch(() => undefined);
      }
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (readingMode === "vertical") return;
    event.preventDefault();
    if (event.button !== 2) return;
    if (window.matchMedia?.("(hover: none)").matches) return;
    if ((event.target as HTMLElement).closest(".reader-controls")) return;
    goToPrevPage();
  };

  const handleModeChange = (newMode: ReaderMode) => {
    setReadingMode(newMode);
    setReadingModeMutation.mutate(newMode);
  };

  if (pagesLoading) {
    return (
      <div className="reader-loading">
        <div className="loading-spinner" />
        <p>Loading chapter...</p>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="reader-empty">
        <p>No pages found in this chapter</p>
        <button onClick={() => onBack()} className="btn btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`reader reader-mode-${readingMode} ${immersive ? "reader-immersive" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`reader-controls top-controls ${showControls ? "visible" : ""}`}
      >
        <button onClick={() => onBack()} className="btn btn-secondary">
          Back
        </button>
        <div className="reader-settings">
          <select
            value={readingMode}
            aria-label="Reading mode"
            onChange={(event) =>
              handleModeChange(event.target.value as ReaderMode)
            }
          >
            <option value="rtl">RTL (Manga)</option>
            <option value="ltr">LTR</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>
        <div className="reader-meta">
          <div className="reader-info">
            {mangaTitle ? (
              <span className="reader-manga-title" title={mangaTitle}>
                {mangaTitle}
              </span>
            ) : null}
            {mangaTitle && chapterTitle ? (
              <span className="reader-info-separator" aria-hidden="true">
                ·
              </span>
            ) : null}
            {chapterTitle ? (
              <span className="reader-chapter-title" title={chapterTitle}>
                {chapterTitle}
              </span>
            ) : null}
          </div>
          <div className="page-indicator">
            {currentPage + 1} / {pages.length}
          </div>
        </div>
        <div className="reader-actions">
          {zoom.scale > 1 ? (
            <button
              type="button"
              className="btn btn-icon reader-zoom-reset"
              title="Reset zoom"
              aria-label="Reset zoom"
              onClick={resetZoom}
            >
              <RotateCcw size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-icon"
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() =>
                setZoom({
                  scale: DOUBLE_TAP_ZOOM,
                  originX: 50,
                  originY: 50,
                })
              }
            >
              <ZoomIn size={18} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-icon"
            title={immersive ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={immersive ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={toggleImmersive}
          >
            {immersive ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {paged ? (
        <div
          className="paged-reader"
          ref={pagedRef}
          role="region"
          aria-label="Chapter pages"
        >
          {displaySlides.map((slide) => (
            <div className="page-slide" key={slide.key}>
              {slide.kind === "page" ? (
                <ReaderPage
                  src={api.getAssetUrl(
                    pages[slide.pageIndex!]?.url,
                  )}
                  pageNumber={slide.pageIndex! + 1}
                  eager={Math.abs(slide.pageIndex! - currentPage) <= PRELOAD_RADIUS}
                  active={slide.pageIndex === currentPage}
                  zoom={zoom}
                  width={pages[slide.pageIndex!]?.width}
                  height={pages[slide.pageIndex!]?.height}
                />
              ) : (
                <ChapterSentinel kind={slide.kind} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="reader-content reader-vertical-scroller"
          ref={verticalRef}
        >
          <div className="vertical-pages">
            {pages.map((page, index) => (
              <div
                className="vertical-page-frame"
                key={page.index ?? index}
                data-page-index={index}
              >
                <ReaderPage
                  src={api.getAssetUrl(page.url)}
                  pageNumber={index + 1}
                  eager={Math.abs(index - currentPage) <= PRELOAD_RADIUS}
                  active={index === currentPage}
                  zoom={zoom}
                  className="vertical"
                  width={page.width}
                  height={page.height}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className={`reader-controls bottom-controls ${showControls ? "visible" : ""}`}
      >
        <button
          onClick={() => goToPrevPage()}
          disabled={currentPage === 0 && !onPrevChapter}
          className="btn btn-secondary"
        >
          Previous
        </button>
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
          />
        </div>
        <button
          onClick={() => goToNextPage()}
          disabled={currentPage === pages.length - 1 && !onNextChapter}
          className="btn btn-primary"
        >
          Next
        </button>
      </div>
    </div>
  );
}
