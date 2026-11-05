import { useState, useEffect, useRef, useCallback } from "react";
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
  isLocal?: boolean;
}

export function SearchResultsGrid({
  results,
  isSearching,
  hasSearched,
  searchQuery,
  onSelect,
  isLoadingDetails,
  isLocal = false,
}: SearchResultsGridProps) {
  const [focusIndex, setFocusIndex] = useState(-1);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, results.length);
  }, [results]);

  useEffect(() => {
    if (results.length > 0 && focusIndex === -1) {
      setFocusIndex(0);
    }
  }, [results]);

  useEffect(() => {
    cardRefs.current[focusIndex]?.focus();
  }, [focusIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      }
    },
    [results.length],
  );

  if (isSearching || isLoadingDetails) {
    return (
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    if (!hasSearched) return null;
    return (
      <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {isLocal ? (
          <>
            <p>No manga found at "{searchQuery}".</p>
            <p className="mt-1">
              Choose a folder that contains chapter subfolders, image files, or
              CBZ/ZIP archives. The folder must exist on the server machine.
            </p>
          </>
        ) : (
          <>
            <p>No manga found for "{searchQuery}".</p>
            <p className="mt-1">
              Try a different query or switch to another source.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {results.length} manga found
        {searchQuery ? ` for "${searchQuery}"` : ""}
      </p>
      <div
        className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        onKeyDown={handleKeyDown}
      >
        {results.map((result, i) => (
          <SearchResultCard
            key={result.sourceMangaId}
            result={result}
            onClick={onSelect}
            isFocused={focusIndex === i}
            cardRef={(el) => {
              cardRefs.current[i] = el;
            }}
            onFocus={() => setFocusIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
