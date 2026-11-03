import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useDiscoverBrowse } from "../api/hooks";

interface AniListManga {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { large: string; medium: string } | null;
  genres: string[];
  mediaType: string;
  status: string;
  averageScore?: number;
  chapters: number | null;
  startDate: { year: number | null; month: number | null; day: number | null };
}

const CATEGORIES = [
  { label: "Trending", sort: "TRENDING_DESC" },
  { label: "Popular", sort: "POPULARITY_DESC" },
  { label: "Top Rated", sort: "SCORE_DESC" },
  { label: "Favorites", sort: "FAVOURITES_DESC" },
  { label: "Newest", sort: "START_DATE_DESC" },
  { label: "Recently Updated", sort: "UPDATED_AT_DESC" },
  { label: "Popular Manhwa", sort: "POPULARITY_DESC", country: "KR" },
  { label: "Popular Manhua", sort: "POPULARITY_DESC", country: "CN" },
];

const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Thriller",
];

interface DiscoverProps {
  onMangaSelect: (anilistId: number) => void;
}

export function Discover({ onMangaSelect }: DiscoverProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]!);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filters = {
    sort: activeCategory.sort,
    country: activeCategory.country,
    search: submittedQuery || undefined,
    genre: selectedGenre || undefined,
    perPage: 30,
  };

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDiscoverBrowse(filters);

  const allManga = useMemo(
    () => data?.pages.flatMap((p) => p.manga) ?? [],
    [data],
  );

  function handleSearch() {
    setSubmittedQuery(searchQuery.trim());
  }

  useEffect(() => {
    categoryRefs.current[activeCategory.label]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeCategory.label]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="discover">
      <style>{`
        .discover { padding: 16px; color: var(--text-primary); height: 100%; overflow-y: auto; }
        .discover-search-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .discover-search-input { flex: 1; padding: 10px 14px; background: var(--bg-secondary); border: 1px solid var(--bg-tertiary); border-radius: 8px; color: var(--text-primary); font-size: 14px; outline: none; }
        .discover-search-input:focus { border-color: #6366f1; }
        .discover-search-btn { padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .discover-search-btn:hover { background: #4f46e5; }
        .discover-categories { display: flex; gap: 8px; margin-bottom: 12px; overflow-x: auto; padding-bottom: 4px; }
        .category-btn { padding: 6px 14px; background: var(--bg-secondary); border: none; border-radius: 16px; color: var(--text-secondary); cursor: pointer; font-size: 13px; white-space: nowrap; transition: all 0.2s; }
        .category-btn.active { background: #6366f1; color: #fff; }
        .category-btn:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
        .discover-filter-toggle { background: none; border: none; color: #6366f1; cursor: pointer; font-size: 13px; padding: 4px 0; margin-bottom: 8px; }
        .discover-filters { margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--bg-tertiary); }
        .discover-filters label { color: var(--text-secondary); font-size: 12px; display: block; margin-bottom: 6px; }
        .discover-genres { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .genre-btn { padding: 4px 10px; background: var(--bg-secondary); border: none; border-radius: 12px; color: var(--text-secondary); cursor: pointer; font-size: 12px; transition: all 0.2s; }
        .genre-btn.active { background: rgba(99, 102, 241, 0.2); color: #818cf8; }
        .genre-btn:hover:not(.active) { background: var(--bg-hover); }
        .discover-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
        .discover-card { background: var(--bg-secondary); border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; position: relative; }
        .discover-card:hover { transform: translateY(-4px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); }
        .discover-card-cover { width: 100%; aspect-ratio: 3/4; object-fit: cover; background: var(--bg-tertiary); }
        .discover-card-placeholder { width: 100%; aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center; background: var(--bg-tertiary); color: var(--text-secondary); font-size: 32px; font-weight: bold; }
        .discover-card-score { position: absolute; top: 6px; right: 6px; background: rgba(99, 102, 241, 0.9); color: #fff; padding: 2px 6px; border-radius: 6px; font-size: 11px; font-weight: bold; }
        .discover-card-info { padding: 8px; }
        .discover-card-title { color: var(--text-primary); font-size: 13px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .discover-card-subtitle { color: var(--text-secondary); font-size: 11px; margin-top: 4px; }
        .discover-error { color: #ef4444; text-align: center; padding: 40px; }
        .discover-empty { color: var(--text-secondary); text-align: center; padding: 40px; }
        .discover-pagination { grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; padding: 24px 0; gap: 8px; }
        .discover-load-more { padding: 10px 32px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s; }
        .discover-load-more:hover { background: #4f46e5; }
        .discover-pagination-text { color: var(--text-secondary); font-size: 13px; margin: 0; }
      `}</style>

      <div className="discover-search-row">
        <input type="text" className="discover-search-input" placeholder="Search manga..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleKeyDown} aria-label="Search manga" />
        <button className="discover-search-btn" onClick={handleSearch}>Search</button>
      </div>

      <div className="discover-categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            ref={(element) => { categoryRefs.current[cat.label] = element; }}
            className={`category-btn ${activeCategory.label === cat.label ? "active" : ""}`}
            aria-pressed={activeCategory.label === cat.label}
            onClick={() => { setActiveCategory(cat); setSelectedGenre(""); }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <button className="discover-filter-toggle" onClick={() => setShowFilters(!showFilters)}>
        {showFilters ? <>Hide Filters <ChevronUp size={14} /></> : <>Filters <ChevronDown size={14} /></>}
      </button>

      {showFilters && (
        <div className="discover-filters">
          <label>Genre</label>
          <div className="discover-genres">
            <button className={`genre-btn ${!selectedGenre ? "active" : ""}`} onClick={() => setSelectedGenre("")}>Any</button>
            {GENRES.map((genre) => (
              <button key={genre} className={`genre-btn ${selectedGenre === genre ? "active" : ""}`} onClick={() => setSelectedGenre(genre)}>{genre}</button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-container"><div className="loading-spinner" /><p>Loading discover...</p></div>
      )}

      {!isLoading && !isFetching && allManga.length === 0 && (
        <div className="discover-empty">No manga found</div>
      )}

      {!isLoading && allManga.length > 0 && (
        <div className="discover-grid">
          {allManga.map((m: AniListManga) => (
            <div
              key={m.id}
              className="discover-card"
              onClick={() => onMangaSelect(m.id)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${m.title.english || m.title.romaji}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onMangaSelect(m.id);
                }
              }}
            >
              {m.coverImage?.large ? (
                <img src={m.coverImage.large} alt={m.title.english || m.title.romaji} className="discover-card-cover" />
              ) : (
                <div className="discover-card-placeholder">{(m.title.english || m.title.romaji).charAt(0).toUpperCase()}</div>
              )}
              {m.averageScore && <div className="discover-card-score">{m.averageScore}%</div>}
              <div className="discover-card-info">
                <div className="discover-card-title">{m.title.english || m.title.romaji}</div>
                <div className="discover-card-subtitle">{m.mediaType.toUpperCase()}{m.chapters ? ` · ${m.chapters} ch` : ""}</div>
              </div>
            </div>
          ))}
          {isFetchingNextPage && (
            <div className="discover-pagination"><div className="loading-spinner" /><p>Loading more...</p></div>
          )}
          {!isFetchingNextPage && hasNextPage && (
            <div className="discover-pagination">
              <button className="discover-load-more" onClick={() => fetchNextPage()}>Load More</button>
            </div>
          )}
          {!isFetchingNextPage && !hasNextPage && allManga.length > 0 && (
            <div className="discover-pagination"><p className="discover-pagination-text">All results loaded</p></div>
          )}
        </div>
      )}
    </div>
  );
}
