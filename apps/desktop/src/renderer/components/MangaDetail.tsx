import React, { useEffect, useRef, useState } from "react";
import { Manga, Chapter, ReadingProgress } from "@mugiwara/types";

interface MangaDetailProps {
  apiBaseUrl: string;
  mangaId: string;
  onBack: () => void;
  onReadChapter: (chapterId: string, chaptersList?: Chapter[]) => void;
}

interface ChapterWithProgress extends Chapter {
  progress?: ReadingProgress;
  isRead?: boolean;
  isCurrent?: boolean;
  progressPercent?: number;
  downloadStatus?: "pending" | "downloading" | "complete" | "error" | "idle";
}

interface AniListResult {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  description: string;
  coverImage: {
    large: string;
    medium: string;
  } | null;
  year: number | null;
  genres: string[];
}

export function MangaDetail({
  apiBaseUrl,
  mangaId,
  onBack,
  onReadChapter,
}: MangaDetailProps) {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<ChapterWithProgress[]>([]);
  const [allProgress, setAllProgress] = useState<ReadingProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Metadata state
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AniListResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Cache-busting timestamp for images
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());

  // Categories state
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; color: string | null }>
  >([]);
  const [mangaCategories, setMangaCategories] = useState<
    Array<{ id: string; name: string; color: string | null }>
  >([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Download state
  const [downloadingChapters, setDownloadingChapters] = useState<Set<string>>(
    new Set(),
  );

  // Chapter menu state
  const [activeChapterMenu, setActiveChapterMenu] = useState<string | null>(
    null,
  );
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchMangaDetail();
    fetchCategories();
    fetchMangaCategories();
  }, [mangaId, apiBaseUrl]);

  async function fetchMangaDetail() {
    try {
      setLoading(true);

      // Fetch manga details
      const mangaRes = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`);
      if (!mangaRes.ok) throw new Error("Failed to fetch manga");
      const mangaData = await mangaRes.json();
      setManga(mangaData);

      // Fetch chapters
      const chaptersRes = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/chapters`,
      );
      if (!chaptersRes.ok) throw new Error("Failed to fetch chapters");
      const chaptersData = await chaptersRes.json();

      // Fetch all chapter progress
      const progressRes = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/progress/all`,
      );
      let progressData: ReadingProgress[] = [];
      if (progressRes.ok) {
        progressData = await progressRes.json();
        setAllProgress(progressData);
      }

      // Enrich chapters with progress info
      const enrichedChapters = enrichChaptersWithProgress(
        chaptersData,
        progressData,
      );
      setChapters(enrichedChapters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function enrichChaptersWithProgress(
    chaptersData: Chapter[],
    progressData: ReadingProgress[],
  ): ChapterWithProgress[] {
    // Create a map of chapterId -> progress for O(1) lookup
    const progressMap = progressData.reduce(
      (acc, progress) => {
        if (progress.chapterId) {
          acc[progress.chapterId] = progress;
        }
        return acc;
      },
      {} as Record<string, ReadingProgress>,
    );

    // Find the most recently read chapter (first in the array since it's sorted by lastReadAt)
    const mostRecentProgress = progressData[0];
    const currentChapterId = mostRecentProgress?.chapterId;

    return chaptersData.map((chapter) => {
      const progress = progressMap[chapter.id];
      const isCurrent = chapter.id === currentChapterId;
      const isRead =
        progress?.isCompleted || (progress?.percentComplete || 0) >= 95;
      const progressPercent = Math.round(progress?.percentComplete || 0);

      return {
        ...chapter,
        progress,
        isRead,
        isCurrent,
        progressPercent: isRead ? 100 : progressPercent,
      };
    });
  }

  async function fetchCategories() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  }

  async function fetchMangaCategories() {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/categories/manga/${mangaId}/categories`,
      );
      if (response.ok) {
        const data = await response.json();
        setMangaCategories(data);
      }
    } catch (err) {
      console.error("Failed to fetch manga categories:", err);
    }
  }

  async function addToCategory(categoryId: string) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/categories/manga/${mangaId}/categories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId }),
        },
      );
      if (response.ok) {
        await fetchMangaCategories();
      }
    } catch (err) {
      console.error("Failed to add to category:", err);
    }
  }

  async function removeFromCategory(categoryId: string) {
    try {
      await fetch(
        `${apiBaseUrl}/api/categories/manga/${mangaId}/categories/${categoryId}`,
        {
          method: "DELETE",
        },
      );
      await fetchMangaCategories();
    } catch (err) {
      console.error("Failed to remove from category:", err);
    }
  }

  async function handleDownloadChapter(chapterId: string, e: React.MouseEvent) {
    e.stopPropagation(); // Prevent chapter click

    // Check if already downloading
    if (downloadingChapters.has(chapterId)) return;

    // Add to downloading set
    setDownloadingChapters((prev) => new Set(prev).add(chapterId));

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/chapters/${chapterId}/download`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to queue download");
      }

      const data = await response.json();

      // If already downloaded, show a brief status
      if (data.message === "Chapter is already downloaded") {
        // Refresh chapters to show updated status
        await fetchMangaDetail();
      }
    } catch (err) {
      console.error("Failed to download chapter:", err);
      setError(
        err instanceof Error ? err.message : "Failed to download chapter",
      );
    } finally {
      // Remove from downloading set after a delay to show feedback
      setTimeout(() => {
        setDownloadingChapters((prev) => {
          const newSet = new Set(prev);
          newSet.delete(chapterId);
          return newSet;
        });
      }, 500);
    }
  }

  // Chapter progress management
  async function handleMarkChapterComplete(
    chapterId: string,
    markPrevious?: boolean,
  ) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/chapters/${chapterId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markPrevious: markPrevious || false }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to mark chapter as complete");
      }

      // Refresh to get updated progress
      await fetchMangaDetail();
      setActiveChapterMenu(null);
    } catch (err) {
      console.error("Failed to mark chapter as complete:", err);
      setError(err instanceof Error ? err.message : "Failed to update chapter");
    }
  }

  async function handleMarkChapterIncomplete(
    chapterId: string,
    markFollowing?: boolean,
  ) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/chapters/${chapterId}/complete`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markFollowing: markFollowing || false }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to mark chapter as incomplete");
      }

      // Refresh to get updated progress
      await fetchMangaDetail();
      setActiveChapterMenu(null);
    } catch (err) {
      console.error("Failed to mark chapter as incomplete:", err);
      setError(err instanceof Error ? err.message : "Failed to update chapter");
    }
  }

  const handleContinueReading = () => {
    // Find the first chapter that is not completed
    const firstIncompleteChapter = chapters.find((c) => !c.isRead);

    if (firstIncompleteChapter) {
      onReadChapter(firstIncompleteChapter.id, chapters);
    } else if (chapters.length > 0 && chapters[0]) {
      // All chapters are read, start from the first one
      onReadChapter(chapters[0].id, chapters);
    }
  };

  const getContinueReadingText = () => {
    const firstIncompleteChapter = chapters.find((c) => !c.isRead);

    if (!firstIncompleteChapter) {
      return chapters.length > 0 ? "Read Again" : "Start Reading";
    }

    if (
      firstIncompleteChapter.progress &&
      firstIncompleteChapter.progress.percentComplete > 0
    ) {
      return `Continue Chapter ${firstIncompleteChapter.chapterId}`;
    }

    return `Start Chapter ${firstIncompleteChapter.chapterId}`;
  };

  const handleEditTitle = () => {
    if (manga) {
      setEditedTitle(manga.title);
      setIsEditingTitle(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle("");
  };

  const handleSaveTitle = async () => {
    if (!manga || !editedTitle.trim()) return;

    try {
      setIsSaving(true);
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editedTitle.trim() }),
      });

      if (!response.ok) throw new Error("Failed to update title");

      setIsEditingTitle(false);
      await fetchMangaDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save title");
    } finally {
      setIsSaving(false);
    }
  };

  // Metadata handlers
  const handleAutoFetch = async () => {
    if (!manga) return;
    try {
      setMetadataLoading(true);
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${manga.id}/metadata/fetch`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch metadata");
      }

      setImageCacheBuster(Date.now());
      await fetchMangaDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!manga) return;
    try {
      setMetadataLoading(true);
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${manga.id}/metadata/search`,
      );
      if (!response.ok) throw new Error("Failed to search");
      const data = await response.json();
      setSearchResults(data.results);
      setShowSearch(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleApplyMetadata = async (anilistId: number) => {
    try {
      setMetadataLoading(true);
      const response = await fetch(
        `${apiBaseUrl}/api/manga/${mangaId}/metadata/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anilistId }),
        },
      );

      if (!response.ok) throw new Error("Failed to apply metadata");

      setShowSearch(false);
      setImageCacheBuster(Date.now());
      await fetchMangaDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setMetadataLoading(false);
    }
  };

  // Handle chapter menu click
  const handleChapterMenuClick = (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMenuPosition({ x: rect.left, y: rect.bottom });
    setActiveChapterMenu(chapterId);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest(".chapter-menu-btn")
      ) {
        setActiveChapterMenu(null);
      }
    };

    if (activeChapterMenu) {
      // Use setTimeout to avoid immediate closing from the same click that opened it
      const timer = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", handleClickOutside);
      };
    }
    return undefined;
  }, [activeChapterMenu]);

  if (loading) {
    return (
      <div className="manga-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading manga details...</p>
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="manga-detail-error">
        <p>{error || "Manga not found"}</p>
        <button onClick={onBack} className="btn btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  const readChaptersCount = chapters.filter((c) => c.isRead).length;

  const getChapterDownloadStatus = (chapter: ChapterWithProgress) => {
    if (downloadingChapters.has(chapter.chapterId)) {
      return "downloading";
    }
    if (chapter.importStatus === "complete") {
      return "complete";
    }
    if (chapter.importStatus === "error") {
      return "error";
    }
    if (
      chapter.importStatus === "pending" ||
      chapter.importStatus === "downloading"
    ) {
      return "pending";
    }
    return "idle";
  };

  // Chapter Menu Component
  const ChapterMenu = ({ chapter }: { chapter: ChapterWithProgress }) => {
    if (activeChapterMenu !== chapter.id) return null;

    return (
      <div
        ref={menuRef}
        className="chapter-menu"
        style={{
          position: "fixed",
          top: menuPosition?.y || 0,
          left: menuPosition?.x || 0,
          backgroundColor: "#1f2937",
          borderRadius: "8px",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
          zIndex: 1000,
          minWidth: "200px",
          padding: "8px 0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!chapter.isRead && (
          <button
            className="chapter-menu-item"
            onClick={() => handleMarkChapterComplete(chapter.id)}
          >
            <span className="menu-icon">✓</span>
            Mark as Read
          </button>
        )}
        {chapter.isRead && (
          <button
            className="chapter-menu-item"
            onClick={() => handleMarkChapterIncomplete(chapter.id)}
          >
            <span className="menu-icon">○</span>
            Mark as Unread
          </button>
        )}
        <div className="chapter-menu-divider" />
        <button
          className="chapter-menu-item"
          onClick={() => handleMarkChapterComplete(chapter.id, true)}
        >
          <span className="menu-icon">✓✓</span>
          Mark All Previous as Read
        </button>
        {chapter.isRead && (
          <button
            className="chapter-menu-item"
            onClick={() => handleMarkChapterIncomplete(chapter.id, true)}
          >
            <span className="menu-icon">○○</span>
            Mark All Following as Unread
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="manga-detail">
      <style>{`
        .chapter-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 16px;
          background: none;
          border: none;
          color: #d1d5db;
          cursor: pointer;
          font-size: 14px;
          text-align: left;
          transition: background-color 0.2s;
        }
        .chapter-menu-item:hover {
          background-color: #374151;
        }
        .chapter-menu-divider {
          height: 1px;
          background-color: #374151;
          margin: 8px 0;
        }
        .menu-icon {
          font-size: 12px;
          width: 20px;
          text-align: center;
        }
        .chapter-actions {
          position: relative;
        }
        .chapter-menu-btn {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 4px 8px;
          font-size: 16px;
          border-radius: 4px;
          transition: background-color 0.2s, color 0.2s;
        }
        .chapter-menu-btn:hover {
          background-color: #374151;
          color: #fff;
        }
        .chapter-progress-indicator {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .chapter-progress-indicator.unread {
          border: 2px solid rgba(255, 255, 255, 0.2);
        }
        .chapter-progress-indicator.read {
          background-color: #22c55e;
          color: white;
        }
        .chapter-progress-indicator.in-progress {
          background: conic-gradient(#6366f1 var(--progress, 0%), transparent 0%);
          border: 2px solid #6366f1;
        }

      `}</style>

      <div className="manga-detail-header">
        <button onClick={onBack} className="btn btn-secondary back-btn">
          ← Back to Library
        </button>
      </div>

      <div className="manga-detail-content">
        <div className="manga-info-section">
          <div className="manga-cover-large">
            {manga.coverImage ? (
              <img
                src={`${apiBaseUrl}${manga.coverImage}?t=${imageCacheBuster}`}
                alt={manga.title}
              />
            ) : (
              <div className="placeholder-cover-large">
                <span>{manga.title.charAt(0)}</span>
              </div>
            )}
          </div>

          <div className="manga-meta">
            {/* Title row with metadata buttons */}
            <div className="manga-title-row">
              <div className="manga-title-container">
                {isEditingTitle ? (
                  <div className="title-edit-mode">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="title-input"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitle();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                    <div className="title-edit-actions">
                      <button
                        onClick={handleSaveTitle}
                        disabled={isSaving || !editedTitle.trim()}
                        className="btn btn-primary btn-sm"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="title-display-mode">
                    <h1 className="manga-title-large">{manga.title}</h1>
                    <button
                      onClick={handleEditTitle}
                      className="btn btn-icon"
                      title="Edit title"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>

              {/* Metadata status and buttons */}
              <div className="metadata-header-actions">
                {manga.anilistId && (
                  <span className="sync-status">Synced with AniList</span>
                )}
                <div className="metadata-buttons">
                  <button
                    onClick={handleAutoFetch}
                    disabled={metadataLoading}
                    className="btn btn-primary btn-sm"
                  >
                    {metadataLoading ? "Fetching..." : "Auto-fetch"}
                  </button>
                  <button
                    onClick={handleSearch}
                    disabled={metadataLoading}
                    className="btn btn-secondary btn-sm"
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible info section */}
            <div
              className={`manga-info-collapsible ${showMore ? "expanded" : ""}`}
            >
              {manga.author && (
                <p className="meta-item">
                  <strong>Author:</strong> {manga.author}
                </p>
              )}
              {manga.artist && (
                <p className="meta-item">
                  <strong>Artist:</strong> {manga.artist}
                </p>
              )}
              <p className="meta-item">
                <strong>Status:</strong> {manga.status}
              </p>
              <p className="meta-item">
                <strong>Type:</strong> {manga.mediaType}
              </p>
              <p className="meta-item">
                <strong>Chapters:</strong> {chapters.length}
              </p>
              {manga.genres && manga.genres.length > 0 && (
                <div className="meta-item">
                  <strong>Genres:</strong>
                  <div className="genres-inline">
                    {manga.genres.map((genre) => (
                      <span key={genre} className="genre-tag-small">
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Categories */}
              <div className="meta-item categories-section">
                <div className="categories-header">
                  <strong>Categories:</strong>
                  <div className="category-dropdown-container">
                    <button
                      onClick={() =>
                        setShowCategoryDropdown(!showCategoryDropdown)
                      }
                      className="btn btn-small btn-secondary"
                    >
                      + Add to Category
                    </button>
                    {showCategoryDropdown && (
                      <div className="category-dropdown">
                        {categories
                          .filter(
                            (cat) =>
                              !mangaCategories.some((mc) => mc.id === cat.id),
                          )
                          .map((category) => (
                            <button
                              key={category.id}
                              onClick={() => {
                                addToCategory(category.id);
                                setShowCategoryDropdown(false);
                              }}
                              className="category-dropdown-item"
                            >
                              <span
                                className="category-dot-small"
                                style={{
                                  backgroundColor: category.color || "#6366f1",
                                }}
                              />
                              {category.name}
                            </button>
                          ))}
                        {categories.filter(
                          (cat) =>
                            !mangaCategories.some((mc) => mc.id === cat.id),
                        ).length === 0 && (
                          <span className="category-dropdown-empty">
                            No more categories
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="manga-categories">
                  {mangaCategories.map((category) => (
                    <span
                      key={category.id}
                      className="category-tag"
                      style={{
                        backgroundColor: category.color
                          ? `${category.color}33`
                          : "rgba(99, 102, 241, 0.2)",
                        borderColor: category.color || "#6366f1",
                        color: category.color || "#818cf8",
                      }}
                    >
                      {category.name}
                      <button
                        onClick={() => removeFromCategory(category.id)}
                        className="category-remove-btn"
                        title="Remove from category"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {mangaCategories.length === 0 && (
                    <span className="no-categories">Not in any category</span>
                  )}
                </div>
              </div>
              {manga.description && (
                <div className="manga-description">
                  <strong>Description:</strong>
                  <div
                    className="description-content"
                    dangerouslySetInnerHTML={{ __html: manga.description }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setShowMore(!showMore)}
              className="btn btn-text show-more-btn"
            >
              {showMore ? "Show less ↑" : "Show more ↓"}
            </button>

            {/* Search results modal */}
            {showSearch && (
              <div className="search-results-overlay">
                <div className="search-results-modal">
                  <h4>Select from AniList results:</h4>
                  <div className="results-grid">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="result-card"
                        onClick={() => handleApplyMetadata(result.id)}
                      >
                        {result.coverImage && (
                          <img
                            src={result.coverImage.medium}
                            alt={result.title.romaji}
                            className="result-cover"
                          />
                        )}
                        <div className="result-info">
                          <h5>{result.title.english || result.title.romaji}</h5>
                          <p className="result-year">{result.year}</p>
                          <div className="result-genres">
                            {result.genres.slice(0, 3).map((g) => (
                              <span key={g} className="genre-tag">
                                {g}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowSearch(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chapters-section">
          <h2>Chapters</h2>

          {/* Continue Reading Section */}
          {chapters.length > 0 && (
            <div className="continue-reading-section">
              <button
                onClick={handleContinueReading}
                className="btn btn-primary continue-reading-btn"
              >
                <span className="continue-icon">▶</span>
                {getContinueReadingText()}
              </button>
              {readChaptersCount > 0 && (
                <div className="reading-stats">
                  <span>
                    {readChaptersCount} / {chapters.length} chapters read
                  </span>
                  <div className="overall-progress-bar">
                    <div
                      className="overall-progress-fill"
                      style={{
                        width: `${(readChaptersCount / chapters.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {chapters.length === 0 ? (
            <p className="no-chapters">No chapters available</p>
          ) : (
            <div className="chapters-list">
              {chapters.map((chapter) => {
                const downloadStatus = getChapterDownloadStatus(chapter);
                return (
                  <div
                    key={chapter.id}
                    className={`chapter-item ${chapter.isRead ? "read" : ""} ${chapter.isCurrent ? "current" : ""}`}
                    onClick={() => onReadChapter(chapter.id, chapters)}
                  >
                    <div className="chapter-status-icon">
                      {chapter.isRead ? (
                        <span className="status-read">✓</span>
                      ) : chapter.isCurrent ? (
                        <span className="status-current">▶</span>
                      ) : (
                        <span className="status-unread">○</span>
                      )}
                    </div>
                    <div className="chapter-info">
                      <span className="chapter-title">
                        {chapter.title || `Chapter ${chapter.chapterId}`}
                      </span>
                    </div>
                    <div className="chapter-meta">
                      {/* Progress indicator - shown for all chapters with progress */}
                      {chapter.progressPercent !== undefined &&
                        chapter.progressPercent > 0 &&
                        !chapter.isRead && (
                          <div className="chapter-progress">
                            <div className="chapter-progress-bar">
                              <div
                                className="chapter-progress-fill"
                                style={{ width: `${chapter.progressPercent}%` }}
                              />
                            </div>
                            <span className="chapter-progress-text">
                              {chapter.progressPercent}%
                            </span>
                          </div>
                        )}
                      {chapter.isRead && (
                        <span className="chapter-read-badge">Read</span>
                      )}
                      <span className="chapter-pages">
                        {chapter.pagesCount > 0
                          ? `${chapter.pagesCount} pages`
                          : "Not downloaded"}
                      </span>

                      {/* Chapter menu button */}
                      <div className="chapter-actions">
                        <button
                          className="chapter-menu-btn"
                          onClick={(e) => handleChapterMenuClick(e, chapter.id)}
                          title="Chapter options"
                        >
                          ⋯
                        </button>
                        <ChapterMenu chapter={chapter} />
                      </div>

                      <button
                        className={`chapter-download-btn ${downloadStatus}`}
                        onClick={(e) =>
                          handleDownloadChapter(chapter.chapterId, e)
                        }
                        disabled={
                          downloadStatus === "downloading" ||
                          downloadStatus === "pending"
                        }
                        title={
                          downloadStatus === "complete"
                            ? "Downloaded (click to re-download)"
                            : downloadStatus === "downloading"
                              ? "Downloading..."
                              : downloadStatus === "error"
                                ? "Download failed - click to retry"
                                : downloadStatus === "pending"
                                  ? "Queued for download"
                                  : "Download chapter"
                        }
                      >
                        {downloadStatus === "complete" ? (
                          <span className="download-icon complete">✓</span>
                        ) : downloadStatus === "downloading" ? (
                          <span className="download-icon downloading">◌</span>
                        ) : downloadStatus === "error" ? (
                          <span className="download-icon error">!</span>
                        ) : downloadStatus === "pending" ? (
                          <span className="download-icon pending">◷</span>
                        ) : (
                          <span className="download-icon">↓</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
