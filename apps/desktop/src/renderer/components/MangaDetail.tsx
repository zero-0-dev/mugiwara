import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle, ArrowLeft, Check, CheckCheck, ChevronDown, ChevronUp,
  Circle, Clock, Download, EllipsisVertical, Loader, Pencil, Play, X,
} from "lucide-react";
import { Manga, Chapter, ReadingProgress } from "@mugiwara-manga/types";
import { useApiClient } from "../api/context";
import { useToast } from "./Toast";
import {
  useManga,
  useChapters,
  useAllChapterProgress,
  useCategories,
  useMangaCategories,
  useMarkChapterComplete,
  useMarkChapterIncomplete,
  useDownloadChapter,
  useUpdateMangaTitle,
  useFetchMetadata,
  useApplyMetadata,
  useAddMangaToCategory,
  useRemoveMangaFromCategory,
  useCheckMangaUpdates,
  useDownloadAllChapters,
} from "../api/hooks";

interface MangaDetailProps {
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
  title: { romaji: string; english: string | null; native: string | null };
  description: string;
  coverImage: { large: string; medium: string } | null;
  year: number | null;
  genres: string[];
}

interface ChapterMenuProps {
  chapter: ChapterWithProgress;
  isActive: boolean;
  position: { x: number; y: number } | null;
  menuRef: React.MutableRefObject<HTMLDivElement | null>;
  onMarkComplete: (chapterId: string, markPrevious?: boolean) => void;
  onMarkIncomplete: (chapterId: string, markFollowing?: boolean) => void;
}

function ChapterMenu({ chapter, isActive, position, menuRef, onMarkComplete, onMarkIncomplete }: ChapterMenuProps) {
  if (!isActive) return null;

  const menuContent = (
    <div ref={menuRef} className="dropdown-menu" style={{ top: position?.y || 0, left: position?.x || 0 }} onClick={(e) => e.stopPropagation()}>
      {!chapter.isRead && <button className="dropdown-menu-item" onClick={() => onMarkComplete(chapter.id)}><span className="menu-icon"><Check size={14} /></span>Mark as Read</button>}
      {chapter.isRead && <button className="dropdown-menu-item" onClick={() => onMarkIncomplete(chapter.id)}><span className="menu-icon"><Circle size={14} /></span>Mark as Unread</button>}
      <div className="dropdown-menu-divider" />
      <button className="dropdown-menu-item" onClick={() => onMarkComplete(chapter.id, true)}><span className="menu-icon"><CheckCheck size={14} /></span>Mark All Previous as Read</button>
      {chapter.isRead && <button className="dropdown-menu-item" onClick={() => onMarkIncomplete(chapter.id, true)}><span className="menu-icon"><Circle size={14} /></span>Mark All Following as Unread</button>}
    </div>
  );
  return createPortal(menuContent, document.body);
}

export function MangaDetail({ mangaId, onBack, onReadChapter }: MangaDetailProps) {
  const api = useApiClient();
  const toast = useToast();

  const { data: manga, isLoading, error: fetchError } = useManga(mangaId);
  const { data: chapters = [] } = useChapters(mangaId);
  const { data: allProgress = [] } = useAllChapterProgress(mangaId);
  const { data: categories = [] } = useCategories();
  const { data: mangaCategories = [] } = useMangaCategories(mangaId);

  const markComplete = useMarkChapterComplete(mangaId);
  const markIncomplete = useMarkChapterIncomplete(mangaId);
  const downloadChapter = useDownloadChapter(mangaId);
  const updateTitle = useUpdateMangaTitle(mangaId);
  const fetchMetadata = useFetchMetadata(mangaId);
  const applyMetadata = useApplyMetadata(mangaId);
  const addToCategory = useAddMangaToCategory(mangaId);
  const removeFromCategory = useRemoveMangaFromCategory(mangaId);
  const checkUpdates = useCheckMangaUpdates(mangaId);
  const downloadAll = useDownloadAllChapters(mangaId);

  const handleCheckUpdates = () => {
    checkUpdates.mutate(undefined, {
      onSuccess: (data) => {
        if (data.newChaptersFound > 0) {
          toast.success(`Found ${data.newChaptersFound} new chapter${data.newChaptersFound > 1 ? "s" : ""}! Queued for download.`);
        } else {
          toast.success("No new chapters found.");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDownloadAll = () => {
    downloadAll.mutate(undefined, {
      onSuccess: (data) => {
        if (data.chaptersQueued > 0) {
          toast.success(`Queued ${data.chaptersQueued} chapter${data.chaptersQueued > 1 ? "s" : ""} for download.`);
        } else {
          toast.success("No pending chapters to download.");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [searchResults, setSearchResults] = useState<AniListResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [activeChapterMenu, setActiveChapterMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const enrichedChapters = useMemo(() => {
    const progressMap = allProgress.reduce((acc, p) => {
      if (p.chapterId) acc[p.chapterId] = p;
      return acc;
    }, {} as Record<string, ReadingProgress>);
    const mostRecentProgress = allProgress[0];
    const currentChapterId = mostRecentProgress?.chapterId;
    return chapters.map((chapter) => {
      const progress = progressMap[chapter.id];
      const isCurrent = chapter.id === currentChapterId;
      const isRead = progress?.isCompleted || (progress?.percentComplete || 0) >= 95;
      const progressPercent = Math.round(progress?.percentComplete || 0);
      return { ...chapter, progress, isRead, isCurrent, progressPercent: isRead ? 100 : progressPercent } as ChapterWithProgress;
    });
  }, [chapters, allProgress]);

  const readChaptersCount = enrichedChapters.filter((c) => c.isRead).length;
  const hasPendingChapters = chapters.some((c) => c.importStatus === "pending");

  const handleContinueReading = () => {
    const firstIncomplete = enrichedChapters.find((c) => !c.isRead);
    if (firstIncomplete) onReadChapter(firstIncomplete.id, chapters);
    else if (chapters[0]) onReadChapter(chapters[0].id, chapters);
  };

  const getContinueReadingText = () => {
    const firstIncomplete = enrichedChapters.find((c) => !c.isRead);
    if (!firstIncomplete) return chapters.length > 0 ? "Read Again" : "Start Reading";
    if (firstIncomplete.progress && firstIncomplete.progress.percentComplete > 0) return `Continue Chapter ${firstIncomplete.chapterId}`;
    return `Start Chapter ${firstIncomplete.chapterId}`;
  };

  const handleEditTitle = () => {
    if (manga) { setEditedTitle(manga.title); setIsEditingTitle(true); }
  };

  const handleCancelEdit = () => { setIsEditingTitle(false); setEditedTitle(""); };

  const handleSaveTitle = async () => {
    if (!manga || !editedTitle.trim()) return;
    updateTitle.mutate(editedTitle.trim(), {
      onSuccess: () => setIsEditingTitle(false),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleAutoFetch = async () => {
    fetchMetadata.mutate(undefined, {
      onSuccess: () => setImageCacheBuster(Date.now()),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleSearch = async () => {
    try {
      const response = await fetch(`${api.getBaseUrl()}/api/manga/${manga!.id}/metadata/search`);
      if (!response.ok) throw new Error("Failed to search");
      const data = await response.json();
      setSearchResults(data.results);
      setShowSearch(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleApplyMetadata = async (anilistId: number) => {
    applyMetadata.mutate({ anilistId }, {
      onSuccess: () => { setShowSearch(false); setImageCacheBuster(Date.now()); },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleMarkChapterComplete = (chapterId: string, markPrevious?: boolean) => {
    markComplete.mutate({ chapterId, markPrevious }, {
      onSuccess: () => setActiveChapterMenu(null),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleMarkChapterIncomplete = (chapterId: string, markFollowing?: boolean) => {
    markIncomplete.mutate({ chapterId, markFollowing }, {
      onSuccess: () => setActiveChapterMenu(null),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDownloadChapter = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    downloadChapter.mutate(chapterId, {
      onError: (err) => toast.error(err.message),
    });
  };

  const handleAddToCategory = (categoryId: string) => {
    addToCategory.mutate(categoryId, { onError: (err) => toast.error(err.message) });
    setShowCategoryDropdown(false);
  };

  const handleRemoveFromCategory = (categoryId: string) => {
    removeFromCategory.mutate(categoryId, { onError: (err) => toast.error(err.message) });
  };

  const handleChapterMenuClick = (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const chapterItem = btn.closest(".chapter-item") as HTMLElement;
    let x = rect.left;
    if (chapterItem && chapterItem.matches(":hover")) x -= 4;
    let y = rect.bottom;
    const menuWidth = 220, menuHeight = 200, padding = 8;
    if (x + menuWidth > window.innerWidth - padding) x = Math.max(padding, rect.right - menuWidth);
    if (y + menuHeight > window.innerHeight - padding) y = Math.max(padding, rect.top - menuHeight);
    setMenuPosition({ x, y });
    setActiveChapterMenu(chapterId);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest(".chapter-menu-btn")) {
        setActiveChapterMenu(null);
      }
    };
    if (activeChapterMenu) {
      const timer = setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
      return () => { clearTimeout(timer); document.removeEventListener("click", handleClickOutside); };
    }
  }, [activeChapterMenu]);

  if (isLoading) {
    return <div className="manga-detail-loading"><div className="loading-spinner"></div><p>Loading manga details...</p></div>;
  }

  if (fetchError || !manga) {
    return <div className="manga-detail-error"><p>{(fetchError as Error)?.message || "Manga not found"}</p><button onClick={onBack} className="btn btn-primary">Go Back</button></div>;
  }

  const getChapterDownloadStatus = (chapter: ChapterWithProgress) => {
    if (chapter.importStatus === "complete") return "complete";
    if (chapter.importStatus === "error") return "error";
    if (chapter.importStatus === "pending" || chapter.importStatus === "downloading") return "pending";
    return "idle";
  };

  return (
    <div className="manga-detail">
      <style>{`
        .menu-icon { width: 20px; display: flex; align-items: center; justify-content: center; }
        .chapter-actions { position: relative; }
        .chapter-menu-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 6px; font-size: 16px; border-radius: 8px; transition: background-color 0.2s, color 0.2s; display: flex; align-items: center; justify-content: center; }
        .chapter-menu-btn:hover { background-color: var(--bg-tertiary); color: var(--text-primary); }
        .chapter-progress-indicator { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .chapter-progress-indicator.unread { border: 2px solid var(--bg-tertiary); }
        .chapter-progress-indicator.read { background-color: var(--success); color: white; }
        .chapter-progress-indicator.in-progress { background: conic-gradient(var(--accent) var(--progress, 0%), transparent 0%); border: 2px solid var(--accent); }
      `}</style>

      <div className="manga-detail-header">
        <button onClick={onBack} className="btn btn-secondary back-btn"><ArrowLeft size={16} /> Back to Library</button>
        <div className="manga-detail-header-actions">
          <button onClick={handleCheckUpdates} disabled={checkUpdates.isPending} className="btn btn-secondary btn-sm">
            {checkUpdates.isPending ? "Checking..." : "Check for Updates"}
          </button>
          {hasPendingChapters && (
            <button onClick={handleDownloadAll} disabled={downloadAll.isPending} className="btn btn-primary btn-sm">
              {downloadAll.isPending ? "Downloading..." : "Download All"}
            </button>
          )}
        </div>
      </div>

      <div className="manga-detail-content">
        <div className="manga-info-section">
          <div className="manga-cover-large">
            {manga.coverImage ? (
              <img src={`${api.getBaseUrl()}${manga.coverImage}?t=${imageCacheBuster}`} alt={manga.title} />
            ) : (
              <div className="placeholder-cover-large"><span>{manga.title.charAt(0)}</span></div>
            )}
          </div>

          <div className="manga-meta">
            <div className="manga-title-row">
              <div className="manga-title-container">
                {isEditingTitle ? (
                  <div className="title-edit-mode">
                    <input type="text" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} className="title-input" autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") handleCancelEdit(); }} />
                    <div className="title-edit-actions">
                      <button onClick={handleSaveTitle} disabled={updateTitle.isPending || !editedTitle.trim()} className="btn btn-primary btn-sm">{updateTitle.isPending ? "Saving..." : "Save"}</button>
                      <button onClick={handleCancelEdit} disabled={updateTitle.isPending} className="btn btn-secondary btn-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="title-display-mode">
                    <h1 className="manga-title-large">{manga.title}</h1>
                    <button onClick={handleEditTitle} className="btn btn-icon" title="Edit title"><Pencil size={16} /></button>
                  </div>
                )}
              </div>

              <div className="metadata-header-actions">
                {manga.anilistId && <span className="sync-status">Synced with AniList</span>}
                <div className="metadata-buttons">
                  <button onClick={handleAutoFetch} disabled={fetchMetadata.isPending} className="btn btn-primary btn-sm">{fetchMetadata.isPending ? "Fetching..." : "Auto-fetch"}</button>
                  <button onClick={handleSearch} disabled={fetchMetadata.isPending} className="btn btn-secondary btn-sm">Search</button>
                </div>
              </div>
            </div>

            <div className={`manga-info-collapsible ${showMore ? "expanded" : ""}`}>
              {manga.author && <p className="meta-item"><strong>Author:</strong> {manga.author}</p>}
              {manga.artist && <p className="meta-item"><strong>Artist:</strong> {manga.artist}</p>}
              <p className="meta-item"><strong>Status:</strong> {manga.status}</p>
              <p className="meta-item"><strong>Type:</strong> {manga.mediaType}</p>
              <p className="meta-item"><strong>Chapters:</strong> {chapters.length}</p>
              {manga.genres && manga.genres.length > 0 && (
                <div className="meta-item"><strong>Genres:</strong><div className="genres-inline">{manga.genres.map((genre) => <span key={genre} className="genre-tag-small">{genre}</span>)}</div></div>
              )}

              <div className="meta-item categories-section">
                <div className="categories-header">
                  <strong>Categories:</strong>
                  <div className="category-dropdown-container">
                    <button onClick={() => setShowCategoryDropdown(!showCategoryDropdown)} className="category-add-btn">+ Add to Category</button>
                    {showCategoryDropdown && (
                      <div className="category-dropdown">
                        {categories.filter((cat) => !mangaCategories.some((mc) => mc.id === cat.id)).map((category) => (
                          <button key={category.id} onClick={() => handleAddToCategory(category.id)} className="category-dropdown-item">
                            <span className="category-dot-small" style={{ backgroundColor: category.color || "#6366f1" }} />{category.name}
                          </button>
                        ))}
                        {categories.filter((cat) => !mangaCategories.some((mc) => mc.id === cat.id)).length === 0 && <span className="category-dropdown-empty">No more categories</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="manga-categories">
                  {mangaCategories.map((category) => (
                    <span key={category.id} className="category-tag" style={{ backgroundColor: category.color ? `${category.color}33` : "rgba(99, 102, 241, 0.2)", borderColor: category.color || "#6366f1", color: category.color || "#818cf8" }}>
                      {category.name}
                      <button onClick={() => handleRemoveFromCategory(category.id)} className="category-remove-btn" title="Remove from category"><X size={12} /></button>
                    </span>
                  ))}
                  {mangaCategories.length === 0 && <span className="no-categories">Not in any category</span>}
                </div>
              </div>
              {manga.description && <div className="manga-description"><strong>Description:</strong><div className="description-content" dangerouslySetInnerHTML={{ __html: manga.description }} /></div>}
            </div>

            <button onClick={() => setShowMore(!showMore)} className="btn btn-text show-more-btn">{showMore ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}</button>

            {showSearch && (
              <div className="search-results-overlay">
                <div className="search-results-modal">
                  <h4>Select from AniList results:</h4>
                  <div className="results-grid">
                    {searchResults.map((result) => (
                      <div key={result.id} className="result-card" onClick={() => handleApplyMetadata(result.id)}>
                        {result.coverImage && <img src={result.coverImage.medium} alt={result.title.romaji} className="result-cover" />}
                        <div className="result-info">
                          <h5>{result.title.english || result.title.romaji}</h5>
                          <p className="result-year">{result.year}</p>
                          <div className="result-genres">{result.genres.slice(0, 3).map((g) => <span key={g} className="genre-tag">{g}</span>)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowSearch(false)} className="btn btn-secondary">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chapters-section">
          <h2>Chapters</h2>

          {enrichedChapters.length > 0 && (
            <div className="continue-reading-section">
              <button onClick={handleContinueReading} className="btn btn-primary continue-reading-btn">
                <span className="continue-icon"><Play size={18} /></span>{getContinueReadingText()}
              </button>
              {readChaptersCount > 0 && (
                <div className="reading-stats">
                  <span>{readChaptersCount} / {enrichedChapters.length} chapters read</span>
                  <div className="overall-progress-bar">
                    <div className="overall-progress-fill" style={{ width: `${(readChaptersCount / enrichedChapters.length) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {enrichedChapters.length === 0 ? (
            <p className="no-chapters">No chapters available</p>
          ) : (
            <div className="chapters-list">
              {enrichedChapters.map((chapter) => {
                const downloadStatus = getChapterDownloadStatus(chapter);
                return (
                  <div key={chapter.id} className={`chapter-item ${chapter.isRead ? "read" : ""} ${chapter.isCurrent ? "current" : ""}`} onClick={() => onReadChapter(chapter.id, chapters)}>
                    <div className="chapter-status-icon">
                      {chapter.isRead ? <span className="status-read"><Check size={14} /></span> : chapter.isCurrent ? <span className="status-current"><Play size={14} /></span> : <span className="status-unread"><Circle size={14} /></span>}
                    </div>
                    <div className="chapter-info">
                      <span className="chapter-title">{chapter.title || `Chapter ${chapter.chapterId}`}</span>
                    </div>
                    <div className="chapter-meta">
                      {chapter.progressPercent !== undefined && chapter.progressPercent > 0 && !chapter.isRead && (
                        <div className="chapter-progress">
                          <div className="chapter-progress-bar"><div className="chapter-progress-fill" style={{ width: `${chapter.progressPercent}%` }} /></div>
                          <span className="chapter-progress-text">{chapter.progressPercent}%</span>
                        </div>
                      )}
                      {chapter.isRead && <span className="chapter-read-badge">Read</span>}
                      <span className="chapter-pages">{chapter.pagesCount > 0 ? `${chapter.pagesCount} pages` : "Not downloaded"}</span>

                      <div className="chapter-actions">
                        <button className="chapter-menu-btn" onClick={(e) => handleChapterMenuClick(e, chapter.id)} title="Chapter options"><EllipsisVertical size={16} /></button>
                        <ChapterMenu chapter={chapter} isActive={activeChapterMenu === chapter.id} position={menuPosition} menuRef={menuRef} onMarkComplete={handleMarkChapterComplete} onMarkIncomplete={handleMarkChapterIncomplete} />
                      </div>

                      <button className={`chapter-download-btn ${downloadStatus}`} onClick={(e) => handleDownloadChapter(chapter.chapterId, e)} disabled={downloadStatus === "downloading" || downloadStatus === "pending"} title={downloadStatus === "complete" ? "Downloaded" : downloadStatus === "downloading" ? "Downloading..." : downloadStatus === "error" ? "Download failed" : downloadStatus === "pending" ? "Queued" : "Download chapter"}>
                        {downloadStatus === "complete" ? <span className="download-icon complete"><Check size={14} /></span> : downloadStatus === "downloading" ? <span className="download-icon downloading"><Loader size={14} /></span> : downloadStatus === "error" ? <span className="download-icon error"><AlertCircle size={14} /></span> : downloadStatus === "pending" ? <span className="download-icon pending"><Clock size={14} /></span> : <span className="download-icon"><Download size={14} /></span>}
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
