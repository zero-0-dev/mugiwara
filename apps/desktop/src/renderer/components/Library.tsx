import React, { useState } from "react";
import { ArrowDown, ArrowUp, Circle, RefreshCw, X } from "lucide-react";
import { useToast } from "./Toast";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { AddMangaModal } from "./AddMangaModal";
import { useLibrary, useFilterOptions, useDeleteManga, useCheckLibraryUpdates } from "../api/hooks";
import { useApiClient } from "../api/context";
import { Select } from "./Select";

interface LibraryProps {
  onMangaSelect: (mangaId: string) => void;
}

export function Library({ onMangaSelect }: LibraryProps) {
  const api = useApiClient();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    mediaType: "",
    genre: "",
    readingStatus: "all",
    category: "",
  });
  const [sortBy, setSortBy] = useState("lastRead");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddManga, setShowAddManga] = useState(false);

  const queryFilters = {
    search: searchQuery || undefined,
    status: filters.status || undefined,
    mediaType: filters.mediaType || undefined,
    genre: filters.genre || undefined,
    category: filters.category || undefined,
    readingStatus: filters.readingStatus !== "all" ? filters.readingStatus : undefined,
    sortBy,
    sortOrder: sortBy === "title" && sortOrder === "desc" ? "asc" : sortOrder,
  };

  const { data: manga = [], isLoading } = useLibrary(queryFilters);
  const { data: filterOptions } = useFilterOptions();
  const deleteManga = useDeleteManga();
  const checkLibraryUpdates = useCheckLibraryUpdates();

  const handleCheckUpdates = () => {
    checkLibraryUpdates.mutate(undefined, {
      onSuccess: (data) => {
        if (data.newChaptersTotal > 0) {
          toast.success(`Found ${data.newChaptersTotal} new chapter${data.newChaptersTotal > 1 ? "s" : ""} across ${data.updated} manga!`);
        } else {
          toast.success("All manga are up to date.");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      action: () => setShowAddManga(true),
      enabled: !showAddManga,
    },
  ]);

  async function handleDeleteManga(mangaId: string, title: string, event: React.MouseEvent) {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to remove "${title}" from your library?`)) return;
    deleteManga.mutate(mangaId, {
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function clearFilters() {
    setSearchQuery("");
    setFilters({ status: "", mediaType: "", genre: "", readingStatus: "all", category: "" });
    setSortBy("lastRead");
    setSortOrder("desc");
  }

  const hasActiveFilters = searchQuery || filters.status || filters.mediaType || filters.genre || filters.category || filters.readingStatus !== "all";

  if (isLoading) return <div className="library-loading">Loading library...</div>;

  return (
    <div className="library">
      <div className="library-header">
        <h2>Library</h2>
        <div className="library-header-actions">
          <button onClick={handleCheckUpdates} disabled={checkLibraryUpdates.isPending} className="btn btn-secondary">
            {checkLibraryUpdates.isPending ? <><RefreshCw size={14} className="spin" /> Checking...</> : <><RefreshCw size={14} /> Check for Updates</>}
          </button>
          <button onClick={() => setShowAddManga(true)} className="btn btn-primary">+ Add Manga</button>
        </div>
      </div>

      <div className="search-filter-section">
        <div className="search-bar">
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title, author, or artist..." className="search-input" />
          {searchQuery && <button onClick={() => setSearchQuery("")} className="search-clear"><X size={16} /></button>}
        </div>
        <div className="filter-controls">
          <button onClick={() => setShowFilters(!showFilters)} className={`btn btn-secondary ${showFilters ? "active" : ""}`}>
            Filters {hasActiveFilters && <Circle size={8} fill="currentColor" />}
          </button>
          <Select value={sortBy} onChange={setSortBy} options={[
            { value: "lastRead", label: "Last Read" },
            { value: "title", label: "Title" },
            { value: "dateAdded", label: "Date Added" },
            { value: "progress", label: "Progress" },
            { value: "chapterCount", label: "Chapter Count" },
          ]} />
          <button onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")} className="btn btn-icon" title={sortOrder === "asc" ? "Ascending" : "Descending"}>
            {sortOrder === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-row">
            <div className="filter-group">
              <label>Status</label>
              <Select value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={[
                { value: "", label: "All" },
                { value: "ongoing", label: "Ongoing" },
                { value: "completed", label: "Completed" },
                { value: "hiatus", label: "Hiatus" },
                { value: "cancelled", label: "Cancelled" },
              ]} />
            </div>
            <div className="filter-group">
              <label>Type</label>
              <Select value={filters.mediaType} onChange={(v) => setFilters({ ...filters, mediaType: v })} options={[
                { value: "", label: "All" },
                { value: "manga", label: "Manga" },
                { value: "manhwa", label: "Manhwa" },
                { value: "manhua", label: "Manhua" },
                { value: "webtoon", label: "Webtoon" },
              ]} />
            </div>
            <div className="filter-group">
              <label>Reading Status</label>
              <Select value={filters.readingStatus} onChange={(v) => setFilters({ ...filters, readingStatus: v })} options={[
                { value: "all", label: "All" },
                { value: "reading", label: "Reading" },
                { value: "completed", label: "Completed" },
                { value: "not-started", label: "Not Started" },
              ]} />
            </div>
            <div className="filter-group">
              <label>Genre</label>
              <Select value={filters.genre} onChange={(v) => setFilters({ ...filters, genre: v })} options={[
                { value: "", label: "All Genres" },
                { value: "Action", label: "Action" },
                { value: "Adventure", label: "Adventure" },
                { value: "Comedy", label: "Comedy" },
                { value: "Drama", label: "Drama" },
                { value: "Fantasy", label: "Fantasy" },
                { value: "Horror", label: "Horror" },
                { value: "Mystery", label: "Mystery" },
                { value: "Romance", label: "Romance" },
                { value: "Sci-Fi", label: "Sci-Fi" },
                { value: "Slice of Life", label: "Slice of Life" },
                { value: "Sports", label: "Sports" },
                { value: "Thriller", label: "Thriller" },
              ]} />
            </div>
            <div className="filter-group">
              <label>Category</label>
              <Select value={filters.category} onChange={(v) => setFilters({ ...filters, category: v })} options={[
                { value: "", label: "All Categories" },
                ...(filterOptions?.categories?.map((cat: { id: string; name: string }) => ({
                  value: cat.id,
                  label: cat.name,
                })) || []),
              ]} />
            </div>
          </div>
          {hasActiveFilters && <button onClick={clearFilters} className="btn btn-text clear-filters">Clear all filters</button>}
        </div>
      )}

      <div className="results-info">{manga.length} manga {hasActiveFilters && "(filtered)"}</div>

      {manga.length === 0 ? (
        <div className="empty-library">
          <p>No manga found{hasActiveFilters ? " matching your filters" : " in your library"}.</p>
          {!hasActiveFilters && <p>Open Settings to add manga directories, then click "Scan Library".</p>}
          {hasActiveFilters && <button onClick={clearFilters} className="btn btn-primary">Clear Filters</button>}
        </div>
      ) : (
        <div className="manga-grid">
          {manga.map((m) => (
            <div key={m.id} className="manga-card" onClick={() => onMangaSelect(m.id)}>
              <div className="manga-cover">
                {m.coverImage ? (
                  <img src={`${api.getBaseUrl()}${m.coverImage}`} alt={m.title} loading="lazy" />
                ) : (
                  <div className="placeholder-cover"><span>{m.title.charAt(0)}</span></div>
                )}
                {(m as { progress?: { percentComplete: number } }).progress && (m as { progress: { percentComplete: number } }).progress.percentComplete > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(m as { progress: { percentComplete: number } }).progress.percentComplete}%` }} />
                  </div>
                )}
                <button className="delete-manga-btn" onClick={(e) => handleDeleteManga(m.id, m.title, e)} disabled={deleteManga.isPending} title="Remove from library">
                  {deleteManga.isPending ? "..." : <X size={16} />}
                </button>
              </div>
              <div className="manga-info">
                <h3 className="manga-title" title={m.title}>{m.title}</h3>
                <span className="manga-chapters">{(m as { chapterCount?: number }).chapterCount || 0} chapters</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddManga && (
        <AddMangaModal
          onClose={() => setShowAddManga(false)}
          onSuccess={() => setShowAddManga(false)}
          onViewManga={onMangaSelect}
        />
      )}
    </div>
  );
}
