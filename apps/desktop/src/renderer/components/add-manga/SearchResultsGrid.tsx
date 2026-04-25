import type { SearchResult } from "./types";
import { SearchResultCard } from "./SearchResultCard";

interface SearchResultsGridProps {
  results: SearchResult[];
  isSearching: boolean;
  onSelect: (manga: SearchResult) => void;
}

export function SearchResultsGrid({ results, isSearching, onSelect }: SearchResultsGridProps) {
  if (isSearching) {
    return (
      <div className="add-manga-results">
        <div className="add-manga-results-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-cover" />
              <div className="skeleton-text short" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) return null;

  return (
    <div className="add-manga-results">
      <div className="add-manga-results-grid">
        {results.map((result) => (
          <SearchResultCard key={result.sourceMangaId} result={result} onClick={onSelect} />
        ))}
      </div>
    </div>
  );
}
