import type { Source, SearchResult } from "./types";
import { SearchResultsGrid } from "./SearchResultsGrid";

interface SearchStepProps {
  sources: Source[];
  selectedSource: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;
  hasSearched: boolean;
  onSelectSource: (id: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onResultClick: (manga: SearchResult) => void;
}

export function SearchStep({
  sources,
  selectedSource,
  searchQuery,
  searchResults,
  isSearching,
  hasSearched,
  onSelectSource,
  onSearchQueryChange,
  onSearch,
  onResultClick,
}: SearchStepProps) {
  const isLocal = selectedSource === "local";

  async function handleBrowse() {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      onSearchQueryChange(folder);
    }
  }

  return (
    <>
      <div className="source-tabs">
        {sources.map((source) => (
          <button
            key={source.id}
            className={`source-tab${selectedSource === source.id ? " active" : ""}`}
            onClick={() => onSelectSource(source.id)}
          >
            {source.name}
          </button>
        ))}
      </div>

      <form className="add-manga-search" onSubmit={onSearch}>
        {isLocal ? (
          <div className="add-manga-search-row">
            <input
              type="text"
              value={searchQuery}
              readOnly
              placeholder="Select a folder containing manga..."
              className="add-manga-search-input"
            />
            <button type="button" className="btn btn-secondary" onClick={handleBrowse}>
              Browse...
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? "Scanning..." : "Scan"}
            </button>
          </div>
        ) : (
          <div className="add-manga-search-row">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Enter manga title..."
              className="add-manga-search-input"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSearching || !searchQuery.trim()}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
        )}
      </form>

      <SearchResultsGrid
        results={searchResults}
        isSearching={isSearching}
        onSelect={onResultClick}
      />

      {!isSearching && searchResults.length === 0 && hasSearched && (
        <div className="add-manga-empty">
          <p>No manga found for "{searchQuery}". Try a different query.</p>
        </div>
      )}
    </>
  );
}
