import { Search, X } from "lucide-react";
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
  isLoadingDetails?: boolean;
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
  isLoadingDetails,
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
    ? "Enter server folder path or browse..."
    : "Search manga by title...";

  const canBrowse = isLocal && Boolean(window.electronAPI?.selectFolder);
  const hasContent = searchQuery.trim().length > 0;

  return (
    <>
      <div className="add-manga-search">
        <div className="add-manga-search-row">
          <div className="add-manga-search-input-wrapper">
            <span className="add-manga-search-icon"><Search size={16} /></span>
            <input
              type="text"
              value={searchQuery}
              readOnly={canBrowse}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="add-manga-search-input"
              autoFocus
              aria-label={isLocal ? "Folder path" : "Search manga"}
            />
            {hasContent && (
              <button
                type="button"
                className="add-manga-search-clear"
                onClick={onClear}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {canBrowse ? (
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
        {!isLocal && <p className="add-manga-search-hint">⌨ Enter to search</p>}
      </div>

      <SearchResultsGrid
        results={searchResults}
        isSearching={isSearching}
        hasSearched={hasSearched}
        searchQuery={searchQuery}
        onSelect={onResultClick}
        isLoadingDetails={isLoadingDetails}
      />
    </>
  );
}
