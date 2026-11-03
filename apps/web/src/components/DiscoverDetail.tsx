import { useState, useRef } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { AddMangaModal } from "./AddMangaModal";
import { useDiscoverManga, useSources, useSearchSource } from "../api/hooks";

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
  anilistId: number;
  onBack: () => void;
  onAddedToLibrary: () => void;
}

export function DiscoverDetail({
  anilistId,
  onBack,
  onAddedToLibrary,
}: DiscoverDetailProps) {
  const [showDescription, setShowDescription] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalResult, setAddModalResult] = useState<SearchResult | null>(null);
  const [addModalSource, setAddModalSource] = useState("");

  const { data: manga, isLoading, error } = useDiscoverManga(anilistId);
  const { data: sources = [] } = useSources();

  const title = manga ? (manga.title.english || manga.title.romaji) : "";

  const { data: searchResults = [], isFetching: searching } = useSearchSource(
    selectedSource,
    selectedSource && title ? title : "",
  );

  const sourcesInited = useRef(false);
  if (!sourcesInited.current && sources.length > 0 && !selectedSource) {
    const remote = sources.filter((s: Source) => s.id !== "local");
    if (remote.length > 0) {
      setSelectedSource(remote[0]!.id);
    }
    sourcesInited.current = true;
  }

  function handleOpenAddModal(result: SearchResult) {
    setAddModalSource(selectedSource || "");
    setAddModalResult(result);
    setShowAddModal(true);
  }

  function handleAddMangaSuccess() {
    setShowAddModal(false);
    // The new manga is already in the library; show it there instead of
    // leaving the user on the AniList discovery page.
    onAddedToLibrary();
  }

  if (isLoading) {
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
        <p>{error instanceof Error ? error.message : "Manga not found"}</p>
        <button onClick={onBack} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  const nativeTitle = manga.title.native;
  const remoteSources = sources.filter((s: Source) => s.id !== "local");

  return (
    <div className="manga-detail">
      <style>{`
        .discover-detail-content { max-width: 900px; margin: 0 auto; padding: 16px; }
        .discover-detail-header-section { display: flex; gap: 24px; margin-bottom: 24px; }
        .discover-detail-cover { width: 240px; flex-shrink: 0; }
        .discover-detail-cover img { width: 100%; border-radius: 12px; }
        .discover-detail-cover-placeholder { width: 100%; aspect-ratio: 3/4; background: var(--bg-tertiary); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 48px; font-weight: bold; }
        .discover-detail-info { flex: 1; }
        .discover-detail-title { font-size: 24px; font-weight: bold; color: var(--text-primary); margin: 0 0 4px 0; }
        .discover-detail-native-title { color: var(--text-secondary); font-size: 14px; margin: 0 0 12px 0; }
        .discover-detail-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
        .discover-detail-score { background: rgba(99, 102, 241, 0.2); color: #818cf8; padding: 2px 8px; border-radius: 6px; font-size: 13px; font-weight: bold; }
        .discover-detail-meta-text { color: var(--text-secondary); font-size: 13px; text-transform: capitalize; }
        .discover-detail-meta-divider { color: var(--text-secondary); }
        .discover-detail-genres { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
        .discover-detail-genre-tag { background: rgba(99, 102, 241, 0.15); color: #818cf8; padding: 2px 10px; border-radius: 12px; font-size: 12px; }
        .discover-detail-info-line { color: var(--text-primary); font-size: 14px; margin: 4px 0; }
        .discover-detail-info-label { color: var(--text-secondary); }
        .discover-detail-description { color: var(--text-primary); font-size: 14px; line-height: 1.6; margin-bottom: 8px; }
        .discover-detail-show-more { background: none; border: none; color: #6366f1; cursor: pointer; font-size: 13px; padding: 0; }
        .discover-detail-tags-section { margin-top: 20px; }
        .discover-detail-tags-section h3 { color: var(--text-primary); font-size: 16px; margin: 0 0 8px 0; }
        .discover-detail-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .discover-detail-tag { background: var(--bg-secondary); color: var(--text-secondary); padding: 2px 8px; border-radius: 8px; font-size: 11px; }
        .discover-detail-add-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--bg-tertiary); }
        .discover-detail-add-section h3 { color: var(--text-primary); font-size: 16px; margin: 0 0 4px 0; }
        .discover-detail-add-subtitle { color: var(--text-secondary); font-size: 13px; margin: 0 0 12px 0; }
        .discover-detail-sources { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .discover-detail-source-btn { padding: 6px 14px; background: var(--bg-secondary); border: none; border-radius: 16px; color: var(--text-secondary); cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .discover-detail-source-btn.active { background: #6366f1; color: #fff; }
        .discover-detail-source-btn:hover:not(.active) { background: var(--bg-hover); color: var(--text-primary); }
        .discover-detail-source-results { display: flex; flex-direction: column; gap: 8px; }
        .discover-detail-source-result { display: flex; align-items: center; gap: 12px; padding: 8px; background: var(--bg-secondary); border-radius: 8px; cursor: pointer; transition: background 0.2s; }
        .discover-detail-source-result:hover { background: var(--bg-hover); }
        .discover-detail-source-result-cover { width: 40px; height: 56px; object-fit: cover; border-radius: 4px; background: var(--bg-tertiary); }
        .discover-detail-source-result-cover-placeholder { width: 40px; height: 56px; border-radius: 4px; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 16px; font-weight: bold; flex-shrink: 0; }
        .discover-detail-source-result-info { flex: 1; }
        .discover-detail-source-result-title { color: var(--text-primary); font-size: 14px; font-weight: 500; }
        .discover-detail-source-result-author { color: var(--text-secondary); font-size: 12px; margin-top: 2px; }
        .discover-detail-no-results { color: #6b7280; font-size: 13px; text-align: center; padding: 16px; }
      `}</style>

      <div className="manga-detail-header">
        <button onClick={onBack} className="btn btn-secondary back-btn"><ArrowLeft size={16} /> Back to Discover</button>
      </div>

      <div className="discover-detail-content">
        <div className="discover-detail-header-section">
          <div className="discover-detail-cover">
            {manga.coverImage?.large ? (
              <img src={manga.coverImage.large} alt={title} />
            ) : (
              <div className="discover-detail-cover-placeholder">{title.charAt(0).toUpperCase()}</div>
            )}
          </div>

          <div className="discover-detail-info">
            <h1 className="discover-detail-title">{title}</h1>
            {nativeTitle && nativeTitle !== title && <p className="discover-detail-native-title">{nativeTitle}</p>}

            <div className="discover-detail-meta">
              {manga.averageScore && <span className="discover-detail-score">{manga.averageScore}%</span>}
              <span className="discover-detail-meta-text">{manga.mediaType.toUpperCase()}</span>
              <span className="discover-detail-meta-divider">|</span>
              <span className="discover-detail-meta-text">{manga.status}</span>
              {manga.chapters && <><span className="discover-detail-meta-divider">|</span><span className="discover-detail-meta-text">{manga.chapters} chapters</span></>}
            </div>

            <div className="discover-detail-genres">
              {manga.genres.map((genre) => <span key={genre} className="discover-detail-genre-tag">{genre}</span>)}
            </div>

            {manga.author && <p className="discover-detail-info-line"><span className="discover-detail-info-label">Author: </span>{manga.author}</p>}
            {manga.artist && <p className="discover-detail-info-line"><span className="discover-detail-info-label">Artist: </span>{manga.artist}</p>}

            {manga.description && (
              <div>
                <div className={`discover-detail-description ${showDescription ? "" : "clamp-4"}`} style={{ display: "-webkit-box", WebkitLineClamp: showDescription ? "unset" : 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {manga.description.replace(/<[^>]*>/g, "")}
                </div>
                <button className="discover-detail-show-more" onClick={() => setShowDescription(!showDescription)}>
                  {showDescription ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
                </button>
              </div>
            )}
          </div>
        </div>

        {manga.tags && manga.tags.length > 0 && (
          <div className="discover-detail-tags-section">
            <h3>Tags</h3>
            <div className="discover-detail-tags">
              {manga.tags.slice(0, 15).map((tag: { name: string }) => (
                <span key={tag.name} className="discover-detail-tag">{tag.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="discover-detail-add-section">
          <h3>Add to Library</h3>
          <p className="discover-detail-add-subtitle">Search for "{title}" in a source to add it to your library</p>

          <div className="discover-detail-sources">
            {remoteSources.map((source: Source) => (
              <button key={source.id} className={`discover-detail-source-btn ${selectedSource === source.id ? "active" : ""}`} onClick={() => setSelectedSource(source.id)}>
                {source.name}
              </button>
            ))}
          </div>

          {searching && (
            <div className="loading-container" style={{ padding: "20px" }}>
              <div className="loading-spinner" /><p>Searching...</p>
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="discover-detail-source-results">
              <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 8px 0" }}>Results:</p>
              {searchResults.map((result: SearchResult) => (
                <div key={result.sourceMangaId} className="discover-detail-source-result" onClick={() => handleOpenAddModal(result)}>
                  {result.coverImageUrl ? (
                    <img src={result.coverImageUrl} alt={result.title} className="discover-detail-source-result-cover" />
                  ) : (
                    <div className="discover-detail-source-result-cover-placeholder">{result.title.charAt(0).toUpperCase()}</div>
                  )}
                  <div className="discover-detail-source-result-info">
                    <div className="discover-detail-source-result-title">{result.title}</div>
                    {result.author && <div className="discover-detail-source-result-author">{result.author}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searching && searchResults.length === 0 && !isLoading && (
            <p className="discover-detail-no-results">No results found in this source</p>
          )}
        </div>
      </div>

      {showAddModal && addModalResult && (
        <AddMangaModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddMangaSuccess}
          onViewManga={(mangaId) => setShowAddModal(false)}
          initialSourceId={addModalSource}
          initialSearchResult={addModalResult}
        />
      )}
    </div>
  );
}
