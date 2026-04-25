import type { SearchResult } from "./types";
import { SearchResultsGrid } from "./SearchResultsGrid";

interface SearchStepProps {
  isLocal: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  hasSearched: boolean;
  onQueryChange: (query: string) => void;
  onSearchImmediate: () => void;
  onClear: () => void;
  onBrowse: () => void;
  onResultClick: (manga: SearchResult) => void;
}

export function SearchStep({
  isLocal,
  searchQuery,
  searchResults,
  isSearching,
  hasSearched,
  onQueryChange,
  onSearchImmediate,
  onClear,
  onBrowse,
  onResultClick,
}: SearchStepProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearchImmediate();
    }
    if (e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
    }
  }

  const placeholder = isLocal
    ? "Enter folder path or browse..."
    : "Search manga by title...";

  const hasContent = searchQuery.trim().length > 0;

  return (
    <>
      <div className="add-manga-search">
        <div className="add-manga-search-row">
          <div className="add-manga-search-input-wrapper">
            <span className="add-manga-search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              readOnly={isLocal}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="add-manga-search-input"
              autoFocus
            />
            {hasContent && (
              <button
                type="button"
                className="add-manga-search-clear"
                onClick={onClear}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {isLocal ? (
            <button type="button" className="btn btn-secondary" onClick={onBrowse}>
              Browse…
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSearchImmediate}
              disabled={isSearching || !hasContent}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          )}
        </div>
        <p className="add-manga-search-hint">⌨ Enter to search</p>
      </div>

      <SearchResultsGrid
        results={searchResults}
        isSearching={isSearching}
        hasSearched={hasSearched}
        searchQuery={searchQuery}
        onSelect={onResultClick}
      />
    </>
  );
}
