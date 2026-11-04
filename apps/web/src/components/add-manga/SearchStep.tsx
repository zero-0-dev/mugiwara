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
  searchError?: string | null;
  /** Electron only: whether a native folder picker exists. */
  nativeFolderPicker?: boolean;
  /** Context-specific copy for local imports (server path vs. this machine). */
  localHint?: string;
  /** Hide keyboard-specific hints on touch-only devices. */
  showKeyboardHints?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
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
  searchError,
  nativeFolderPicker = false,
  localHint,
  showKeyboardHints = true,
  inputRef,
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
    ? nativeFolderPicker
      ? "Enter a folder path or browse..."
      : "Enter a folder path on the server..."
    : "Search manga by title...";

  const hasContent = searchQuery.trim().length > 0;
  const hintParts: string[] = [];
  if (isLocal) {
    hintParts.push(localHint || "Enter a folder path on the server machine.");
    if (showKeyboardHints) hintParts.push("Press Enter to search.");
  } else if (showKeyboardHints) {
    hintParts.push("Press Enter to search.");
  }

  return (
    <>
      <div className="add-manga-search">
        <div className="add-manga-search-row">
          <div className="add-manga-search-input-wrapper">
            <span className="add-manga-search-icon"><Search size={16} /></span>
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="add-manga-search-input"
              aria-label={isLocal ? "Local folder path" : "Search manga"}
              autoFocus
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
          {isLocal && nativeFolderPicker ? (
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
              {isSearching ? "Searching..." : isLocal ? "Find manga" : "Search"}
            </button>
          )}
        </div>
        {isLocal && !nativeFolderPicker && (
          <button
            type="button"
            className="add-manga-path-link"
            onClick={onBrowse}
          >
            Enter server path
          </button>
        )}
        {searchError ? (
          <p className="add-manga-search-error" role="alert">{searchError}</p>
        ) : (
          hintParts.length > 0 && (
            <p className="add-manga-search-hint">{hintParts.join(" ")}</p>
          )
        )}
      </div>

      <SearchResultsGrid
        results={searchResults}
        isSearching={isSearching}
        hasSearched={hasSearched}
        searchQuery={searchQuery}
        onSelect={onResultClick}
        isLoadingDetails={isLoadingDetails}
        isLocal={isLocal}
      />
    </>
  );
}
