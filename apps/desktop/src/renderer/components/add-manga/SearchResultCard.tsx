import type { RefCallback } from "react";
import type { SearchResult } from "./types";

interface SearchResultCardProps {
  result: SearchResult;
  onClick: (manga: SearchResult) => void;
  isFocused: boolean;
  cardRef: RefCallback<HTMLDivElement>;
  onFocus: () => void;
}

export function SearchResultCard({
  result,
  onClick,
  isFocused,
  cardRef,
  onFocus,
}: SearchResultCardProps) {
  const firstLetter = result.title.charAt(0).toUpperCase();

  return (
    <div
      className={`add-manga-result-card${isFocused ? " focused" : ""}`}
      ref={cardRef}
      onClick={() => onClick(result)}
      role="button"
      tabIndex={-1}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(result);
        }
      }}
    >
      {result.coverImageUrl ? (
        <img
          src={result.coverImageUrl}
          alt={result.title}
          className="add-manga-result-cover"
          loading="lazy"
        />
      ) : (
        <div className="add-manga-result-placeholder">
          <span className="add-manga-result-placeholder-letter">{firstLetter}</span>
        </div>
      )}
      <div className="add-manga-result-info">
        <span className="add-manga-result-title">{result.title}</span>
      </div>
    </div>
  );
}
