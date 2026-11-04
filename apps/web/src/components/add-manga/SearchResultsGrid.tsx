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
    if (isLocal) {
      return (
        <div className="add-manga-empty">
          <p>No manga found at "{searchQuery}".</p>
          <p>
            Choose a folder that contains chapter subfolders, image files, or
            CBZ/ZIP archives. The folder must exist on the server machine.
          </p>
        </div>
      );
    }
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
      <div className="add-manga-results-grid" onKeyDown={handleKeyDown}>
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
