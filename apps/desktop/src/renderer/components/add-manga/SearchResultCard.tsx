import type { SearchResult } from "./types";

interface SearchResultCardProps {
  result: SearchResult;
  onClick: (manga: SearchResult) => void;
}

export function SearchResultCard({ result, onClick }: SearchResultCardProps) {
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
      {result.coverImageUrl && (
        <img
          src={result.coverImageUrl}
          alt={result.title}
          className="add-manga-result-cover"
        />
      )}
      <div className="add-manga-result-info">
        <span className="add-manga-result-title">{result.title}</span>
      </div>
    </div>
  );
}
