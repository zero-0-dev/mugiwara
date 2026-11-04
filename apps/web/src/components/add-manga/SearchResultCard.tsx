import type { RefCallback } from "react";
import { useApiClient } from "../../api/context";
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
  const api = useApiClient();
  const firstLetter = result.title.charAt(0).toUpperCase();
  const coverUrl = api.getAssetUrl(result.coverImageUrl);

  return (
    <div
      className={`add-manga-result-card${isFocused ? " focused" : ""}`}
      ref={cardRef}
      onClick={() => onClick(result)}
      role="button"
      tabIndex={0}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(result);
        }
      }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
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
