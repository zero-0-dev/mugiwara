import React, { useState } from "react";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { AddMangaModal } from "./AddMangaModal";
import { useLibrary, useFilterOptions, useDeleteManga } from "../api/hooks";
import { useApiClient } from "../api/context";

interface LibraryProps {
  onMangaSelect: (mangaId: string) => void;
}

export function Library({ onMangaSelect }: LibraryProps) {
  const api = useApiClient();
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
    deleteManga.mutate(mangaId);
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
        <button onClick={() => setShowAddManga(true)} className="btn btn-primary">+ Add Manga</button>
      </div>

      <div className="search-filter-section">
        <div className="search-bar">
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title, author, or artist..." className="search-input" />
          {searchQuery && <button onClick={() => setSearchQuery("")} className="search-clear">×</button>}
        </div>
        <div className="filter-controls">
          <button onClick={() => setShowFilters(!showFilters)} className={`btn btn-secondary ${showFilters ? "active" : ""}`}>
            Filters {hasActiveFilters && "•"}
          </button>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="sort-select">
            <option value="lastRead">Last Read</option>
            <option value="title">Title</option>
            <option value="dateAdded">Date Added</option>
            <option value="progress">Progress</option>
            <option value="chapterCount">Chapter Count</option>
          </select>
          <button onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")} className="btn btn-icon" title={sortOrder === "asc" ? "Ascending" : "Descending"}>
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-row">
            <div className="filter-group">
              <label>Status</label>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">All</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="hiatus">Hiatus</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Type</label>
              <select value={filters.mediaType} onChange={(e) => setFilters({ ...filters, mediaType: e.target.value })}>
                <option value="">All</option>
                <option value="manga">Manga</option>
                <option value="manhwa">Manhwa</option>
                <option value="manhua">Manhua</option>
                <option value="webtoon">Webtoon</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Reading Status</label>
              <select value={filters.readingStatus} onChange={(e) => setFilters({ ...filters, readingStatus: e.target.value })}>
                <option value="all">All</option>
                <option value="reading">Reading</option>
                <option value="completed">Completed</option>
                <option value="not-started">Not Started</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Genre</label>
              <select value={filters.genre} onChange={(e) => setFilters({ ...filters, genre: e.target.value })}>
                <option value="">All Genres</option>
                <option value="Action">Action</option>
                <option value="Adventure">Adventure</option>
                <option value="Comedy">Comedy</option>
                <option value="Drama">Drama</option>
                <option value="Fantasy">Fantasy</option>
                <option value="Horror">Horror</option>
                <option value="Mystery">Mystery</option>
                <option value="Romance">Romance</option>
                <option value="Sci-Fi">Sci-Fi</option>
                <option value="Slice of Life">Slice of Life</option>
                <option value="Sports">Sports</option>
                <option value="Thriller">Thriller</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Category</label>
              <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
                <option value="">All Categories</option>
                {filterOptions?.categories?.map((cat: { id: string; name: string }) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
          {hasActiveFilters && <button onClick={clearFilters} className="btn btn-text clear-filters">Clear all filters</button>}
        </div>
      )}

      <div className="results-info">{manga.length} manga {hasActiveFilters && "(filtered)"}</div>

      {deleteManga.isError && <div className="error-message"><span>{(deleteManga.error as Error)?.message}</span><button onClick={() => deleteManga.reset()}>Dismiss</button></div>}

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
                  {deleteManga.isPending ? "..." : "×"}
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
