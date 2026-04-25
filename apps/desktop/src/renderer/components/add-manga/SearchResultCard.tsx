import type { SearchResult } from "./types";

interface SearchResultCardProps {
  result: SearchResult;
  onClick: (manga: SearchResult) => void;
}

export function SearchResultCard({ result, onClick }: SearchResultCardProps) {
  const firstLetter = result.title.charAt(0).toUpperCase();

  return (
    <div
      className="add-manga-result-card"
      onClick={() => onClick(result)}
      role="button"
      tabIndex={0}
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
