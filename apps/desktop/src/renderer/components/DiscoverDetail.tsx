import { useEffect, useRef, useState } from "react";
import { AddMangaModal } from "./AddMangaModal";

interface AniListManga {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  description: string | null;
  coverImage: { large: string; medium: string } | null;
  bannerImage: string | null;
  author: string | null;
  artist: string | null;
  status: string;
  genres: string[];
  mediaType: string;
  tags: { name: string }[];
  startDate: { year: number | null; month: number | null; day: number | null };
  chapters: number | null;
  volumes: number | null;
  averageScore?: number;
  popularity?: number;
  favourites?: number;
}

interface Source {
  id: string;
  name: string;
  description: string;
}

interface SearchResult {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  description?: string;
  author?: string;
  artist?: string;
}

interface DiscoverDetailProps {
  apiBaseUrl: string;
  anilistId: number;
  onBack: () => void;
}

export function DiscoverDetail({
  apiBaseUrl,
  anilistId,
  onBack,
}: DiscoverDetailProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [manga, setManga] = useState<AniListManga | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDescription, setShowDescription] = useState(false);

  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalSearch, setAddModalSearch] = useState("");
  const [addModalSource, setAddModalSource] = useState("");

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    fetchManga();
    fetchSources();
  }, [anilistId, apiBaseUrl]);

  useEffect(() => {
    if (!selectedSource || !manga) return;
    const title = manga.title.english || manga.title.romaji;
    if (!title) return;
    searchSource(selectedSource, title);
  }, [selectedSource, manga]);

  async function fetchManga() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setLoading(true);
      const response = await fetch(
        `${apiBaseUrl}/api/discover/manga/${anilistId}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Failed to fetch manga");
      const data = await response.json();
      setManga(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (abortRef.current !== controller) return;
      setLoading(false);
    }
  }

  async function fetchSources() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`${apiBaseUrl}/api/library/sources`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to load sources");
      const data = await response.json();
      const remote = data.filter((s: Source) => s.id !== "local");
      setSources(remote);
      if (remote.length > 0) {
        setSelectedSource(remote[0].id);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Failed to fetch sources:", err);
    }
  }

  async function searchSource(sourceId: string, query: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setSearching(true);
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/${sourceId}/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Search failed:", err);
      setSearchResults([]);
    } finally {
      if (abortRef.current !== controller) return;
      setSearching(false);
    }
  }

  function handleOpenAddModal(result: SearchResult) {
    setAddModalSource(selectedSource || "");
    setAddModalSearch(`${result.title} (${selectedSource})`);
    setShowAddModal(true);
  }

  function handleAddMangaSuccess() {
    setShowAddModal(false);
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading manga details...</p>
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="manga-detail-error">
        <p>{error || "Manga not found"}</p>
        <button onClick={onBack} className="btn btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  const title = manga.title.english || manga.title.romaji;
  const nativeTitle = manga.title.native;

  return (
    <div className="manga-detail">
      <style>{`
        .discover-detail-content {
          max-width: 900px;
          margin: 0 auto;
          padding: 16px;
        }
        .discover-detail-header-section {
          display: flex;
          gap: 24px;
          margin-bottom: 24px;
        }
        .discover-detail-cover {
          width: 240px;
          flex-shrink: 0;
        }
        .discover-detail-cover img {
          width: 100%;
          border-radius: 12px;
        }
        .discover-detail-cover-placeholder {
          width: 100%;
          aspect-ratio: 3/4;
          background: #333;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
          font-size: 48px;
          font-weight: bold;
        }
        .discover-detail-info {
          flex: 1;
        }
        .discover-detail-title {
          font-size: 24px;
          font-weight: bold;
          color: #fff;
          margin: 0 0 4px 0;
        }
        .discover-detail-native-title {
          color: #6b7280;
          font-size: 14px;
          margin: 0 0 12px 0;
        }
        .discover-detail-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .discover-detail-score {
          background: rgba(99, 102, 241, 0.2);
          color: #818cf8;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: bold;
        }
        .discover-detail-meta-text {
          color: #9ca3af;
          font-size: 13px;
          text-transform: capitalize;
        }
        .discover-detail-meta-divider {
          color: #4b5563;
        }
        .discover-detail-genres {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .discover-detail-genre-tag {
          background: rgba(99, 102, 241, 0.15);
          color: #818cf8;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 12px;
        }
        .discover-detail-info-line {
          color: #d1d5db;
          font-size: 14px;
          margin: 4px 0;
        }
        .discover-detail-info-label {
          color: #6b7280;
        }
        .discover-detail-description {
          color: #d1d5db;
          font-size: 14px;
          line-height: 1.6;
          margin-bottom: 8px;
        }
        .discover-detail-show-more {
          background: none;
          border: none;
          color: #6366f1;
          cursor: pointer;
          font-size: 13px;
          padding: 0;
        }
        .discover-detail-tags-section {
          margin-top: 20px;
        }
        .discover-detail-tags-section h3 {
          color: #fff;
          font-size: 16px;
          margin: 0 0 8px 0;
        }
        .discover-detail-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .discover-detail-tag {
          background: #252525;
          color: #9ca3af;
          padding: 2px 8px;
          border-radius: 8px;
          font-size: 11px;
        }
        .discover-detail-add-section {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #333;
        }
        .discover-detail-add-section h3 {
          color: #fff;
          font-size: 16px;
          margin: 0 0 4px 0;
        }
        .discover-detail-add-subtitle {
          color: #6b7280;
          font-size: 13px;
          margin: 0 0 12px 0;
        }
        .discover-detail-sources {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .discover-detail-source-btn {
          padding: 6px 14px;
          background: #252525;
          border: none;
          border-radius: 16px;
          color: #9ca3af;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }
        .discover-detail-source-btn.active {
          background: #6366f1;
          color: #fff;
        }
        .discover-detail-source-btn:hover:not(.active) {
          background: #333;
          color: #e5e7eb;
        }
        .discover-detail-source-results {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .discover-detail-source-result {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px;
          background: #252525;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .discover-detail-source-result:hover {
          background: #333;
        }
        .discover-detail-source-result-cover {
          width: 40px;
          height: 56px;
          object-fit: cover;
          border-radius: 4px;
          background: #333;
        }
        .discover-detail-source-result-cover-placeholder {
          width: 40px;
          height: 56px;
          border-radius: 4px;
          background: #333;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
          font-size: 16px;
          font-weight: bold;
          flex-shrink: 0;
        }
        .discover-detail-source-result-info {
          flex: 1;
        }
        .discover-detail-source-result-title {
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
        .discover-detail-source-result-author {
          color: #6b7280;
          font-size: 12px;
          margin-top: 2px;
        }
        .discover-detail-no-results {
          color: #6b7280;
          font-size: 13px;
          text-align: center;
          padding: 16px;
        }
      `}</style>

      <div className="manga-detail-header">
        <button onClick={onBack} className="btn btn-secondary back-btn">
          ← Back to Discover
        </button>
      </div>

      <div className="discover-detail-content">
        <div className="discover-detail-header-section">
          <div className="discover-detail-cover">
            {manga.coverImage?.large ? (
              <img
                src={manga.coverImage.large}
                alt={title}
              />
            ) : (
              <div className="discover-detail-cover-placeholder">
                {title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="discover-detail-info">
            <h1 className="discover-detail-title">{title}</h1>
            {nativeTitle && nativeTitle !== title && (
              <p className="discover-detail-native-title">{nativeTitle}</p>
            )}

            <div className="discover-detail-meta">
              {manga.averageScore && (
                <span className="discover-detail-score">
                  {manga.averageScore}%
                </span>
              )}
              <span className="discover-detail-meta-text">
                {manga.mediaType.toUpperCase()}
              </span>
              <span className="discover-detail-meta-divider">|</span>
              <span className="discover-detail-meta-text">{manga.status}</span>
              {manga.chapters && (
                <>
                  <span className="discover-detail-meta-divider">|</span>
                  <span className="discover-detail-meta-text">
                    {manga.chapters} chapters
                  </span>
                </>
              )}
            </div>

            <div className="discover-detail-genres">
              {manga.genres.map((genre) => (
                <span key={genre} className="discover-detail-genre-tag">
                  {genre}
                </span>
              ))}
            </div>

            {manga.author && (
              <p className="discover-detail-info-line">
                <span className="discover-detail-info-label">Author: </span>
                {manga.author}
              </p>
            )}
            {manga.artist && (
              <p className="discover-detail-info-line">
                <span className="discover-detail-info-label">Artist: </span>
                {manga.artist}
              </p>
            )}

            {manga.description && (
              <div>
                <div
                  className={`discover-detail-description ${showDescription ? "" : "clamp-4"}`}
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: showDescription ? "unset" : 4,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {manga.description.replace(/<[^>]*>/g, "")}
                </div>
                <button
                  className="discover-detail-show-more"
                  onClick={() => setShowDescription(!showDescription)}
                >
                  {showDescription ? "Show less ↑" : "Show more ↓"}
                </button>
              </div>
            )}
          </div>
        </div>

        {manga.tags && manga.tags.length > 0 && (
          <div className="discover-detail-tags-section">
            <h3>Tags</h3>
            <div className="discover-detail-tags">
              {manga.tags.slice(0, 15).map((tag) => (
                <span key={tag.name} className="discover-detail-tag">
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="discover-detail-add-section">
          <h3>Add to Library</h3>
          <p className="discover-detail-add-subtitle">
            Search for "{title}" in a source to add it to your library
          </p>

          <div className="discover-detail-sources">
            {sources.map((source) => (
              <button
                key={source.id}
                className={`discover-detail-source-btn ${selectedSource === source.id ? "active" : ""}`}
                onClick={() => setSelectedSource(source.id)}
              >
                {source.name}
              </button>
            ))}
          </div>

          {searching && (
            <div className="loading-container" style={{ padding: "20px" }}>
              <div className="loading-spinner" />
              <p>Searching...</p>
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="discover-detail-source-results">
              <p
                style={{
                  color: "#9ca3af",
                  fontSize: 12,
                  margin: "0 0 8px 0",
                }}
              >
                Results:
              </p>
              {searchResults.map((result) => (
                <div
                  key={result.sourceMangaId}
                  className="discover-detail-source-result"
                  onClick={() => handleOpenAddModal(result)}
                >
                  {result.coverImageUrl ? (
                    <img
                      src={result.coverImageUrl}
                      alt={result.title}
                      className="discover-detail-source-result-cover"
                    />
                  ) : (
                    <div className="discover-detail-source-result-cover-placeholder">
                      {result.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="discover-detail-source-result-info">
                    <div className="discover-detail-source-result-title">
                      {result.title}
                    </div>
                    {result.author && (
                      <div className="discover-detail-source-result-author">
                        {result.author}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searching && searchResults.length === 0 && !loading && (
            <p className="discover-detail-no-results">
              No results found in this source
            </p>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddMangaModal
          apiBaseUrl={apiBaseUrl}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddMangaSuccess}
          onViewManga={(mangaId) => {
            setShowAddModal(false);
          }}
          initialSearchQuery={addModalSearch}
        />
      )}
    </div>
  );
}
