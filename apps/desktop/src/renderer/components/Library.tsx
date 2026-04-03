import React, { useEffect, useState, useCallback } from "react";
import { Manga } from "@mugiwara/types";
import { AddMangaModal } from "./AddMangaModal";

interface MangaWithCount extends Manga {
  chapterCount?: number;
}

interface FilterOptions {
  categories: Array<{ id: string; name: string; color?: string }>;
  statuses: Array<{ status: string; count: number }>;
  mediaTypes: Array<{ mediaType: string; count: number }>;
  readingStatus: {
    total: number;
    reading: number;
    completed: number;
    notStarted: number;
  };
}

interface LibraryProps {
  apiBaseUrl: string;
  onMangaSelect: (mangaId: string) => void;
}

export function Library({ apiBaseUrl, onMangaSelect }: LibraryProps) {
  const [manga, setManga] = useState<MangaWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Search and filter state
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
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(
    null,
  );
  const [showFilters, setShowFilters] = useState(false);
  const [showAddManga, setShowAddManga] = useState(false);

  useEffect(() => {
    fetchManga();
    loadFilterOptions();
  }, [apiBaseUrl]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFilteredManga();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, sortBy, sortOrder]);

  async function loadFilterOptions() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/library/filters/options`);
      if (response.ok) {
        const data = await response.json();
        setFilterOptions(data);
      }
    } catch (err) {
      console.error("Failed to load filter options:", err);
    }
  }

  async function fetchManga() {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/manga`);
      if (!response.ok) throw new Error("Failed to fetch manga");
      const data = await response.json();
      setManga(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFilteredManga() {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (filters.status) params.append("status", filters.status);
      if (filters.mediaType) params.append("mediaType", filters.mediaType);
      if (filters.genre) params.append("genre", filters.genre);
      if (filters.category) params.append("category", filters.category);
      if (filters.readingStatus !== "all")
        params.append("readingStatus", filters.readingStatus);

      // Fix: Use ascending order for title sorting by default
      let effectiveSortOrder = sortOrder;
      if (sortBy === "title" && sortOrder === "desc") {
        effectiveSortOrder = "asc";
      }
      params.append("sortBy", sortBy);
      params.append("sortOrder", effectiveSortOrder);

      const response = await fetch(
        `${apiBaseUrl}/api/library/filter?${params}`,
      );
      if (!response.ok) throw new Error("Failed to filter manga");
      const data = await response.json();
      setManga(data);
    } catch (err) {
      console.error("Failed to filter manga:", err);
    }
  }

  async function handleDeleteManga(
    mangaId: string,
    title: string,
    event: React.MouseEvent,
  ) {
    event.stopPropagation();

    if (
      !confirm(`Are you sure you want to remove "${title}" from your library?`)
    ) {
      return;
    }

    try {
      setDeleting(mangaId);
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete manga");

      setManga((prev) => prev.filter((m) => m.id !== mangaId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete manga");
    } finally {
      setDeleting(null);
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setFilters({
      status: "",
      mediaType: "",
      genre: "",
      readingStatus: "all",
      category: "",
    });
    setSortBy("lastRead");
    setSortOrder("desc");
  }

  const hasActiveFilters =
    searchQuery ||
    filters.status ||
    filters.mediaType ||
    filters.genre ||
    filters.category ||
    filters.readingStatus !== "all";

  if (loading) {
    return <div className="library-loading">Loading library...</div>;
  }

  return (
    <div className="library">
      <div className="library-header">
        <h2>Library</h2>
        <button
          onClick={() => setShowAddManga(true)}
          className="btn btn-primary"
        >
          + Add Manga
        </button>
      </div>

      {/* Search and Filters */}
      <div className="search-filter-section">
        <div className="search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, or artist..."
            className="search-input"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="search-clear">
              ×
            </button>
          )}
        </div>

        <div className="filter-controls">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn btn-secondary ${showFilters ? "active" : ""}`}
          >
            Filters {hasActiveFilters && "•"}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="lastRead">Last Read</option>
            <option value="title">Title</option>
            <option value="dateAdded">Date Added</option>
            <option value="progress">Progress</option>
            <option value="chapterCount">Chapter Count</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="btn btn-icon"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-row">
            <div className="filter-group">
              <label>Status</label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
              >
                <option value="">All</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="hiatus">Hiatus</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Type</label>
              <select
                value={filters.mediaType}
                onChange={(e) =>
                  setFilters({ ...filters, mediaType: e.target.value })
                }
              >
                <option value="">All</option>
                <option value="manga">Manga</option>
                <option value="manhwa">Manhwa</option>
                <option value="manhua">Manhua</option>
                <option value="webtoon">Webtoon</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Reading Status</label>
              <select
                value={filters.readingStatus}
                onChange={(e) =>
                  setFilters({ ...filters, readingStatus: e.target.value })
                }
              >
                <option value="all">All</option>
                <option value="reading">Reading</option>
                <option value="completed">Completed</option>
                <option value="not-started">Not Started</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Genre</label>
              <select
                value={filters.genre}
                onChange={(e) =>
                  setFilters({ ...filters, genre: e.target.value })
                }
              >
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
                <option value="Supernatural">Supernatural</option>
                <option value="Thriller">Thriller</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Category</label>
              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters({ ...filters, category: e.target.value })
                }
              >
                <option value="">All Categories</option>
                {filterOptions?.categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="btn btn-text clear-filters"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      <div className="results-info">
        {manga.length} manga {hasActiveFilters && "(filtered)"}
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {manga.length === 0 ? (
        <div className="empty-library">
          <p>
            No manga found
            {hasActiveFilters ? " matching your filters" : " in your library"}.
          </p>
          {!hasActiveFilters && (
            <p>
              Open Settings to add manga directories, then click "Scan Library".
            </p>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn btn-primary">
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="manga-grid">
          {manga.map((m) => (
            <div
              key={m.id}
              className="manga-card"
              onClick={() => onMangaSelect(m.id)}
            >
              <div className="manga-cover">
                {m.coverImage ? (
                  <img
                    src={`${apiBaseUrl}${m.coverImage}`}
                    alt={m.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="placeholder-cover">
                    <span>{m.title.charAt(0)}</span>
                  </div>
                )}
                {m.progress && m.progress.percentComplete > 0 && (
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${m.progress.percentComplete}%` }}
                    />
                  </div>
                )}
                <button
                  className="delete-manga-btn"
                  onClick={(e) => handleDeleteManga(m.id, m.title, e)}
                  disabled={deleting === m.id}
                  title="Remove from library"
                >
                  {deleting === m.id ? "..." : "×"}
                </button>
              </div>
              <div className="manga-info">
                <h3 className="manga-title" title={m.title}>
                  {m.title}
                </h3>
                <span className="manga-chapters">
                  {m.chapterCount || 0} chapters
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddManga && (
        <AddMangaModal
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowAddManga(false)}
          onSuccess={() => {
            setShowAddManga(false);
            fetchManga();
          }}
        />
      )}
    </div>
  );
}
