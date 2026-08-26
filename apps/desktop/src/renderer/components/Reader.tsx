import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";
import { PageInfo } from "@mugiwara-manga/types";
import { useApiClient } from "../api/context";
import { useReadingMode, useChapterPages, useChapterProgress, useUpdateChapterProgress, useSetReadingMode } from "../api/hooks";

interface ReaderProps {
  mangaId: string;
  chapterId: string;
  onBack: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
  initialPage?: number;
  onInitialPageUsed?: () => void;
}

type ReadingMode = "rtl" | "ltr" | "vertical";

export function Reader({
  mangaId,
  chapterId,
  onBack,
  onNextChapter,
  onPrevChapter,
  initialPage,
  onInitialPageUsed,
}: ReaderProps) {
  const api = useApiClient();
  const { data: pages = [] as PageInfo[], isLoading: pagesLoading } = useChapterPages(mangaId, chapterId);
  const { data: chapterProgress } = useChapterProgress(mangaId, chapterId);
  const { data: serverReadingModeData } = useReadingMode(mangaId);
  const { mutate: saveProgress } = useUpdateChapterProgress(mangaId, chapterId);
  const setReadingModeMutation = useSetReadingMode(mangaId);

  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readingMode, setReadingMode] = useState<ReadingMode>("rtl");
  const [showControls, setShowControls] = useState(true);
  const [savedPageIndex, setSavedPageIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false);
  const didInitialScroll = useRef(false);
  const initialPageRef = useRef<number | undefined>(initialPage);
  const hasRestoredProgress = useRef(false);

  useEffect(() => { initialPageRef.current = initialPage; }, [initialPage]);

  useEffect(() => {
    didInitialScroll.current = false;
    hasRestoredProgress.current = false;
    setSavedPageIndex(null);
    setCurrentPage(0);
  }, [chapterId]);

  useEffect(() => {
    if (serverReadingModeData?.mode) {
      setReadingMode(serverReadingModeData.mode as ReadingMode);
    }
  }, [serverReadingModeData]);

  useEffect(() => {
    if (pages.length > 0) {
      setLoading(false);
    }
  }, [pages.length]);

  useEffect(() => {
    if (pages.length > 0 && initialPageRef.current !== undefined) {
      if (initialPageRef.current === -1) {
        setCurrentPage(pages.length - 1);
      } else {
        setCurrentPage(initialPageRef.current);
      }
      initialPageRef.current = undefined;
      onInitialPageUsed?.();
    }
  }, [pages.length, onInitialPageUsed]);

  useEffect(() => {
    if (pages.length > 0 && !pagesLoading && !hasRestoredProgress.current) {
      hasRestoredProgress.current = true;
      if (chapterProgress?.pageNumber > 1) {
        const pageIndex = chapterProgress.pageNumber - 1;
        setCurrentPage(pageIndex);
        if (readingMode === "vertical") {
          setSavedPageIndex(pageIndex);
        }
      }
    }
  }, [pages.length, pagesLoading, chapterProgress, readingMode]);

  useLayoutEffect(() => {
    if (readingMode === "vertical" && pages.length > 0 && savedPageIndex !== null && savedPageIndex > 0 && !didInitialScroll.current) {
      didInitialScroll.current = true;
      const pageElements = contentRef.current?.querySelectorAll(".manga-page.vertical");
      if (pageElements && pageElements[savedPageIndex]) {
        (pageElements[savedPageIndex] as HTMLElement).scrollIntoView({ behavior: "auto", block: "start" });
      }
    }
  }, [readingMode, pages, savedPageIndex]);

  useEffect(() => {
    if (pages.length === 0 || loading) return;
    const timer = setTimeout(() => {
      saveProgress({
        pageNumber: currentPage + 1,
        totalPages: pages.length,
        isCompleted: currentPage === pages.length - 1,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [currentPage, pages.length, saveProgress]);

  useEffect(() => {
    if (readingMode !== "vertical") return;
    const content = contentRef.current;
    if (!content) return;
    const handleScroll = () => {
      if (isScrollingRef.current) return;
      const windowHeight = window.innerHeight;
      const pageElements = content.querySelectorAll(".manga-page.vertical");
      for (let i = 0; i < pageElements.length; i++) {
        const page = pageElements[i] as HTMLElement;
        const rect = page.getBoundingClientRect();
        if (rect.top < windowHeight / 2 && rect.bottom > windowHeight / 2) {
          setCurrentPage(i);
          break;
        }
      }
    };
    content.addEventListener("scroll", handleScroll, { passive: true });
    return () => content.removeEventListener("scroll", handleScroll);
  }, [readingMode, pages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readingMode === "vertical") {
        if (e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); scrollVertical(300); }
        else if (e.key === "ArrowUp") { e.preventDefault(); scrollVertical(-300); }
        else if (e.key === "Escape") { onBack(); }
        return;
      }
      switch (e.key) {
        case "ArrowRight": readingMode === "rtl" ? goToPrevPage() : goToNextPage(); break;
        case "ArrowLeft": readingMode === "rtl" ? goToNextPage() : goToPrevPage(); break;
        case " ":
        case "ArrowDown": e.preventDefault(); readingMode === "rtl" ? goToPrevPage() : goToNextPage(); break;
        case "Escape": onBack(); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, pages.length, readingMode, onBack, onNextChapter, onPrevChapter]);

  const scrollVertical = (amount: number) => {
    const content = contentRef.current;
    if (!content) return;
    content.scrollBy({ top: amount, behavior: "smooth" });
  };

  const goToNextPage = useCallback(() => {
    if (readingMode === "vertical") { scrollVertical(window.innerHeight * 0.8); return; }
    if (currentPage < pages.length - 1) setCurrentPage((prev) => prev + 1);
    else if (onNextChapter) onNextChapter();
  }, [currentPage, pages.length, onNextChapter, readingMode]);

  const goToPrevPage = useCallback(() => {
    if (readingMode === "vertical") { scrollVertical(-window.innerHeight * 0.8); return; }
    if (currentPage > 0) setCurrentPage((prev) => prev - 1);
    else if (onPrevChapter) onPrevChapter();
  }, [currentPage, onPrevChapter, readingMode]);

  const handleScreenClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".reader-controls")) return;
    if (readingMode === "vertical") {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
      return;
    }
    if (e.button === 0) { e.preventDefault(); goToNextPage(); return; }
    if (e.button === 2) { e.preventDefault(); goToPrevPage(); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    if (readingMode === "rtl") {
      if (x < rect.width * 0.3) goToNextPage();
      else if (x > rect.width * 0.7) goToPrevPage();
    } else {
      if (x < rect.width * 0.3) goToPrevPage();
      else if (x > rect.width * 0.7) goToNextPage();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (readingMode !== "vertical") e.preventDefault();
  };

  const handleModeChange = async (newMode: ReadingMode) => {
    setReadingMode(newMode);
    setReadingModeMutation.mutate(newMode);
    if (newMode === "vertical") {
      setTimeout(() => {
        const pageElements = contentRef.current?.querySelectorAll(".manga-page.vertical");
        if (pageElements && pageElements[currentPage]) {
          (pageElements[currentPage] as HTMLElement).scrollIntoView({ behavior: "auto", block: "start" });
        }
      }, 50);
    }
  };

  if (pagesLoading || pages.length === 0) {
    return <div className="reader-loading"><div className="loading-spinner"></div><p>Loading chapter...</p></div>;
  }

  if (pages.length === 0) {
    return <div className="reader-empty"><p>No pages found in this chapter</p><button onMouseDown={() => onBack()} className="btn btn-primary">Go Back</button></div>;
  }

  const currentPageData = pages[currentPage];

  if (!currentPageData && readingMode !== "vertical") {
    return <div className="reader-error"><p>Error: Could not load page</p><button onMouseDown={() => onBack()} className="btn btn-primary">Go Back</button></div>;
  }

  return (
    <div ref={containerRef} className={`reader reader-mode-${readingMode}`} onMouseDown={handleScreenClick} onContextMenu={handleContextMenu}>
      <div className={`reader-controls top-controls ${showControls ? "visible" : ""}`}>
        <button onMouseDown={(e) => { e.stopPropagation(); onBack(); }} className="btn btn-secondary">Back</button>
        <div className="reader-settings">
          <select value={readingMode} onChange={(e) => handleModeChange(e.target.value as ReadingMode)}>
            <option value="rtl">Right to Left (Manga)</option>
            <option value="ltr">Left to Right</option>
            <option value="vertical">Vertical (Webtoon)</option>
          </select>
        </div>
        <div className="page-indicator">{currentPage + 1} / {pages.length}</div>
      </div>

      <div className="reader-content" ref={contentRef}>
        {readingMode === "vertical" ? (
          <div className="vertical-pages">
            {pages.map((page, index) => (
              <img key={index} src={`${api.getBaseUrl()}${page.url}`} alt={`Page ${index + 1}`} className="manga-page vertical" loading={Math.abs(index - currentPage) < 3 ? "eager" : "lazy"} />
            ))}
          </div>
        ) : (
          currentPageData && <img src={`${api.getBaseUrl()}${currentPageData.url}`} alt={`Page ${currentPage + 1}`} className="manga-page" />
        )}
      </div>

      <div className={`reader-controls bottom-controls ${showControls ? "visible" : ""}`}>
        <button onMouseDown={(e) => { e.stopPropagation(); goToPrevPage(); }} disabled={currentPage === 0 && !onPrevChapter} className="btn btn-secondary">Previous</button>
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }} />
        </div>
        <button onMouseDown={(e) => { e.stopPropagation(); goToNextPage(); }} disabled={currentPage === pages.length - 1 && !onNextChapter} className="btn btn-primary">Next</button>
      </div>

      {readingMode !== "vertical" && (
        <div className="click-zones">
          <div className="click-zone prev-zone" />
          <div className="click-zone menu-zone" />
          <div className="click-zone next-zone" />
        </div>
      )}
    </div>
  );
}
