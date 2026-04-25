import type { SearchResult } from "./types";
import { SearchResultCard } from "./SearchResultCard";
import { SkeletonCard } from "./SkeletonCard";

interface SearchResultsGridProps {
  results: SearchResult[];
  isSearching: boolean;
  hasSearched: boolean;
  searchQuery: string;
  onSelect: (manga: SearchResult) => void;
  isLoadingDetails?: boolean;
}

export function SearchResultsGrid({ results, isSearching, hasSearched, searchQuery, onSelect, isLoadingDetails }: SearchResultsGridProps) {
  if (isSearching || isLoadingDetails) {
    return (
      <div className="add-manga-results">
        <div className="add-manga-results-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    if (!hasSearched) return null;
    return (
      <div className="add-manga-empty">
        <p>No manga found for "{searchQuery}".</p>
        <p>Try a different query or switch to another source.</p>
      </div>
    );
  }

  return (
    <div className="add-manga-results">
      <p className="add-manga-results-count">
        {results.length} manga found{searchQuery ? ` for "${searchQuery}"` : ""}
      </p>
      <div className="add-manga-results-grid">
        {results.map((result) => (
          <SearchResultCard key={result.sourceMangaId} result={result} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}
