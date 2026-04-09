import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { PageInfo, ReadingProgress, Manga } from "@mugiwara/types";

interface ReaderProps {
  apiBaseUrl: string;
  mangaId: string;
  chapterId: string;
  onBack: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
}

type ReadingMode = "rtl" | "ltr" | "vertical";

export function Reader({
  apiBaseUrl,
  mangaId,
  chapterId,
  onBack,
  onNextChapter,
  onPrevChapter,
}: ReaderProps) {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>("rtl");
  const [showControls, setShowControls] = useState(true);
  const [manga, setManga] = useState<Manga | null>(null);
  const [savedPageIndex, setSavedPageIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isScrollingRef = useRef(false);
  const didInitialScroll = useRef(false);

  // Reset state when chapter changes
  useEffect(() => {
    didInitialScroll.current = false;
    setSavedPageIndex(null);
    setCurrentPage(0);
  }, [chapterId]);

  // Load manga info and reading mode on mount
  useEffect(() => {
    loadMangaAndReadingMode();
  }, [mangaId, apiBaseUrl]);

  // Fetch pages when chapter changes
  useEffect(() => {
    fetchPages();
  }, [chapterId, apiBaseUrl]);

  // Load progress once when pages are loaded
  useEffect(() => {
    if (pages.length > 0 && !loading) {
      loadProgress();
    }
  }, [pages.length, loading]);

  // Immediate scroll restoration for vertical mode after render
  // useLayoutEffect runs synchronously after render but before paint
  // This prevents the flicker of seeing the top before scrolling
  useLayoutEffect(() => {
    if (
      readingMode === "vertical" &&
      pages.length > 0 &&
      !loading &&
      savedPageIndex !== null &&
      savedPageIndex > 0 &&
      !didInitialScroll.current
    ) {
      didInitialScroll.current = true;
      const pageIndex = savedPageIndex;

      // Query elements immediately - no timeout, no retries
      const pageElements = contentRef.current?.querySelectorAll(
        ".manga-page.vertical",
      );
      if (pageElements && pageElements[pageIndex]) {
        pageElements[pageIndex].scrollIntoView({
          behavior: "auto",
          block: "start",
        });
      } else {
        console.warn(`[Reader] Could not find page ${pageIndex + 1} element`);
      }
    }
  }, [readingMode, pages, loading, savedPageIndex]);

  useEffect(() => {
    console.log(
      `[Reader] Progress effect triggered: currentPage=${currentPage}, pages.length=${pages.length}, loading=${loading}`,
    );
    if (pages.length > 0 && !loading) {
      saveProgress();
    }
  }, [currentPage, pages.length, loading]);

  // Handle scroll in vertical mode
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
        if (e.key === "ArrowDown" || e.key === " ") {
          e.preventDefault();
          scrollVertical(300);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          scrollVertical(-300);
        } else if (e.key === "Escape") {
          onBack();
        }
        return;
      }

      switch (e.key) {
        case "ArrowRight":
          readingMode === "rtl" ? goToPrevPage() : goToNextPage();
          break;
        case "ArrowLeft":
          readingMode === "rtl" ? goToNextPage() : goToPrevPage();
          break;
        case " ":
        case "ArrowDown":
          e.preventDefault();
          readingMode === "rtl" ? goToPrevPage() : goToNextPage();
          break;
        case "Escape":
          onBack();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentPage,
    pages.length,
    readingMode,
    onBack,
    onNextChapter,
    onPrevChapter,
  ]);

  async function loadMangaAndReadingMode() {
    try {
      const mangaResponse = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`);
      if (mangaResponse.ok) {
        const mangaData: Manga = await mangaResponse.json();
        setManga(mangaData);
        await loadReadingMode(mangaData.mediaType);
      }
    } catch (err) {
      console.error("Failed to load manga info:", err);
      setReadingMode("rtl");
    }
  }

  async function loadReadingMode(mediaType: string) {
    try {
      const mangaSettingResponse = await fetch(
        `${apiBaseUrl}/api/settings/readingMode/${mangaId}`,
      );
      if (mangaSettingResponse.ok) {
        const data = await mangaSettingResponse.json();
        if (data && data.value) {
          setReadingMode(data.value as ReadingMode);
          return;
        }
      }

      const mediaTypeKey = mediaType !== "unknown" ? mediaType : "manga";
      const mediaTypeResponse = await fetch(
        `${apiBaseUrl}/api/settings/reading/mode/${mediaTypeKey}`,
      );
      if (mediaTypeResponse.ok) {
        const data = await mediaTypeResponse.json();
        setReadingMode(data.mode as ReadingMode);
      } else {
        setReadingMode("rtl");
      }
    } catch (err) {
      console.error("Failed to load reading mode:", err);
      setReadingMode("rtl");
    }
  }

  const scrollVertical = (amount: number) => {
    const content = contentRef.current;
    if (!content) return;
    content.scrollBy({ top: amount, behavior: "smooth" });
  };

  async function fetchPages() {
    try {
      setLoading(true);
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/chapters/${chapterId}/pages`,
      );
      if (!response.ok) throw new Error("Failed to fetch pages");
      const data = await response.json();
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function loadProgress() {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/progress`,
      );
      if (response.ok) {
        const progress: ReadingProgress | null = await response.json();
        if (
          progress &&
          progress.chapterId === chapterId &&
          progress.pageNumber > 1
        ) {
          const pageIndex = progress.pageNumber - 1;
          setCurrentPage(pageIndex);

          // For vertical mode, save the page index for scroll restoration
          if (readingMode === "vertical") {
            setSavedPageIndex(pageIndex);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load progress:", err);
    }
  }

  async function saveProgress() {
    try {
      console.log(
        `[Reader] Saving progress: manga=${mangaId}, chapter=${chapterId}, page=${currentPage + 1}/${pages.length}`,
      );
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/progress`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId,
            pageNumber: currentPage + 1,
            totalPages: pages.length,
            isCompleted: currentPage === pages.length - 1,
          }),
        },
      );
      if (!response.ok) {
        console.error(`[Reader] Failed to save progress: ${response.status}`);
      } else {
        console.log(`[Reader] Progress saved successfully`);
      }
    } catch (err) {
      console.error("[Reader] Failed to save progress:", err);
    }
  }

  const goToNextPage = useCallback(() => {
    if (readingMode === "vertical") {
      scrollVertical(window.innerHeight * 0.8);
      return;
    }
    if (currentPage < pages.length - 1) {
      setCurrentPage((prev) => prev + 1);
    } else if (onNextChapter) {
      onNextChapter();
    }
  }, [currentPage, pages.length, onNextChapter, readingMode]);

  const goToPrevPage = useCallback(() => {
    if (readingMode === "vertical") {
      scrollVertical(-window.innerHeight * 0.8);
      return;
    }
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
    } else if (onPrevChapter) {
      onPrevChapter();
    }
  }, [currentPage, onPrevChapter, readingMode]);

  const handleScreenClick = (e: React.MouseEvent) => {
    if (readingMode === "vertical") {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
      return;
    }

    // Handle mouse button clicks for navigation
    // Left click (button 0) -> next page, Right click (button 2) -> prev page
    if (e.button === 0) {
      // Left click - go forward
      e.preventDefault();
      goToNextPage();
      return;
    } else if (e.button === 2) {
      // Right click - go backward
      e.preventDefault();
      goToPrevPage();
      return;
    }

    // Fallback to zone-based clicking for other buttons (middle click, etc.)
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;

    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    if (readingMode === "rtl") {
      if (x < width * 0.3) goToNextPage();
      else if (x > width * 0.7) goToPrevPage();
    } else {
      if (x < width * 0.3) goToPrevPage();
      else if (x > width * 0.7) goToNextPage();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // Prevent default context menu when in RTL or LTR mode for right-click navigation
    if (readingMode !== "vertical") {
      e.preventDefault();
    }
  };

  const handleModeChange = async (newMode: ReadingMode) => {
    setReadingMode(newMode);

    try {
      await fetch(`${apiBaseUrl}/api/settings/readingMode/${mangaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: newMode }),
      });
    } catch (err) {
      console.error("Failed to save reading mode preference:", err);
    }

    if (newMode === "vertical") {
      setTimeout(() => {
        const pageElements = contentRef.current?.querySelectorAll(
          ".manga-page.vertical",
        );
        if (pageElements && pageElements[currentPage]) {
          pageElements[currentPage].scrollIntoView({
            behavior: "auto",
            block: "start",
          });
        }
      }, 50);
    }
  };

  if (loading) {
    return (
      <div className="reader-loading">
        <div className="loading-spinner"></div>
        <p>Loading chapter...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reader-error">
        <p>{error}</p>
        <button onMouseDown={() => onBack()} className="btn btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="reader-empty">
        <p>No pages found in this chapter</p>
        <button onMouseDown={() => onBack()} className="btn btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  const currentPageData = pages[currentPage];

  return (
    <div
      ref={containerRef}
      className={`reader reader-mode-${readingMode}`}
      onMouseDown={handleScreenClick}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`reader-controls top-controls ${showControls ? "visible" : ""}`}
      >
        <button
          onMouseDown={(e) => {
            e.stopPropagation();
            onBack();
          }}
          className="btn btn-secondary"
        >
          Back
        </button>
        <div className="reader-settings">
          <select
            value={readingMode}
            onChange={(e) => handleModeChange(e.target.value as ReadingMode)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="rtl">Right to Left (Manga)</option>
            <option value="ltr">Left to Right</option>
            <option value="vertical">Vertical (Webtoon)</option>
          </select>
        </div>
        <div className="page-indicator">
          {currentPage + 1} / {pages.length}
        </div>
      </div>

      <div className="reader-content" ref={contentRef}>
        {readingMode === "vertical" ? (
          <div className="vertical-pages">
            {pages.map((page, index) => (
              <img
                key={index}
                src={`${apiBaseUrl}${page.url}`}
                alt={`Page ${index + 1}`}
                className="manga-page vertical"
                loading={Math.abs(index - currentPage) < 3 ? "eager" : "lazy"}
              />
            ))}
          </div>
        ) : (
          <img
            src={`${apiBaseUrl}${currentPageData.url}`}
            alt={`Page ${currentPage + 1}`}
            className="manga-page"
          />
        )}
      </div>

      <div
        className={`reader-controls bottom-controls ${showControls ? "visible" : ""}`}
      >
        <button
          onMouseDown={(e) => {
            e.stopPropagation();
            goToPrevPage();
          }}
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
          onMouseDown={(e) => {
            e.stopPropagation();
            goToNextPage();
          }}
          disabled={currentPage === pages.length - 1 && !onNextChapter}
          className="btn btn-primary"
        >
          Next
        </button>
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
