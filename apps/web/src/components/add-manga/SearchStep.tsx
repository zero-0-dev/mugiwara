import { Search, X } from "lucide-react";
import type { SearchResult } from "./types";
import { SearchResultsGrid } from "./SearchResultsGrid";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

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
  nativeFolderPicker?: boolean;
  localHint?: string;
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
      <div className="mt-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Search className="size-4" />
            </span>
            <Input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="pl-9 pr-9"
              aria-label={isLocal ? "Local folder path" : "Search manga"}
              autoFocus
            />
            {hasContent && (
              <button
                type="button"
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={onClear}
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {isLocal && nativeFolderPicker ? (
            <Button type="button" variant="outline" onClick={onBrowse}>
              Browse…
            </Button>
          ) : (
            <Button
              type="button"
              variant="brand"
              onClick={onSearchImmediate}
              disabled={isSearching || !hasContent}
            >
              {isSearching ? "Searching..." : isLocal ? "Find manga" : "Search"}
            </Button>
          )}
        </div>
        {isLocal && !nativeFolderPicker && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-1 h-auto px-0"
            onClick={onBrowse}
          >
            Enter server path
          </Button>
        )}
        {searchError ? (
          <p className="mt-2 text-xs text-destructive-text" role="alert">
            {searchError}
          </p>
        ) : (
          hintParts.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {hintParts.join(" ")}
            </p>
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
