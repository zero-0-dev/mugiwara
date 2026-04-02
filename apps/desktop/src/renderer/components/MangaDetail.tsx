import React, { useEffect, useState } from 'react';
import { Manga, Chapter } from '@mugiwara/types';

interface MangaDetailProps {
  apiBaseUrl: string;
  mangaId: string;
  onBack: () => void;
  onReadChapter: (chapterId: string) => void;
}

interface AniListResult {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  description: string;
  coverImage: {
    large: string;
    medium: string;
  } | null;
  year: number | null;
  genres: string[];
}

export function MangaDetail({ apiBaseUrl, mangaId, onBack, onReadChapter }: MangaDetailProps) {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  
  // Metadata state
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<AniListResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  
  // Cache-busting timestamp for images
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());

  useEffect(() => {
    fetchMangaDetail();
  }, [mangaId, apiBaseUrl]);

  async function fetchMangaDetail() {
    try {
      setLoading(true);
      
      const mangaRes = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`);
      if (!mangaRes.ok) throw new Error('Failed to fetch manga');
      const mangaData = await mangaRes.json();
      setManga(mangaData);
      
      const chaptersRes = await fetch(`${apiBaseUrl}/api/manga/${mangaId}/chapters`);
      if (!chaptersRes.ok) throw new Error('Failed to fetch chapters');
      const chaptersData = await chaptersRes.json();
      setChapters(chaptersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const handleEditTitle = () => {
    if (manga) {
      setEditedTitle(manga.title);
      setIsEditingTitle(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  const handleSaveTitle = async () => {
    if (!manga || !editedTitle.trim()) return;

    try {
      setIsSaving(true);
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle.trim() }),
      });

      if (!response.ok) throw new Error('Failed to update title');

      setIsEditingTitle(false);
      await fetchMangaDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save title');
    } finally {
      setIsSaving(false);
    }
  };

  // Metadata handlers
  const handleAutoFetch = async () => {
    if (!manga) return;
    try {
      setMetadataLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/manga/${manga.id}/metadata/fetch`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch metadata');
      }

      // Update cache buster to force image reload
      setImageCacheBuster(Date.now());
      await fetchMangaDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!manga) return;
    try {
      setMetadataLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/manga/${manga.id}/metadata/search`);
      if (!response.ok) throw new Error('Failed to search');
      const data = await response.json();
      setSearchResults(data.results);
      setShowSearch(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleApplyMetadata = async (anilistId: number) => {
    try {
      setMetadataLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}/metadata/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilistId }),
      });

      if (!response.ok) throw new Error('Failed to apply metadata');
      
      setShowSearch(false);
      // Update cache buster to force image reload
      setImageCacheBuster(Date.now());
      await fetchMangaDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMetadataLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="manga-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading manga details...</p>
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="manga-detail-error">
        <p>{error || 'Manga not found'}</p>
        <button onClick={onBack} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  return (
    <div className="manga-detail">
      <div className="manga-detail-header">
        <button onClick={onBack} className="btn btn-secondary back-btn">
          ← Back to Library
        </button>
      </div>

      <div className="manga-detail-content">
        <div className="manga-info-section">
          <div className="manga-cover-large">
            {manga.coverImage ? (
              <img src={`${apiBaseUrl}${manga.coverImage}?t=${imageCacheBuster}`} alt={manga.title} />
            ) : (
              <div className="placeholder-cover-large">
                <span>{manga.title.charAt(0)}</span>
              </div>
            )}
          </div>
          
          <div className="manga-meta">
            {/* Title row with metadata buttons */}
            <div className="manga-title-row">
              <div className="manga-title-container">
                {isEditingTitle ? (
                  <div className="title-edit-mode">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="title-input"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <div className="title-edit-actions">
                      <button
                        onClick={handleSaveTitle}
                        disabled={isSaving || !editedTitle.trim()}
                        className="btn btn-primary btn-sm"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="btn btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="title-display-mode">
                    <h1 className="manga-title-large">{manga.title}</h1>
                    <button
                      onClick={handleEditTitle}
                      className="btn btn-icon"
                      title="Edit title"
                    >
                      ✏️
                    </button>
                  </div>
                )}
              </div>

              {/* Metadata status and buttons */}
              <div className="metadata-header-actions">
                {manga.anilistId && (
                  <span className="sync-status">Synced with AniList</span>
                )}
                <div className="metadata-buttons">
                  <button
                    onClick={handleAutoFetch}
                    disabled={metadataLoading}
                    className="btn btn-primary btn-sm"
                  >
                    {metadataLoading ? 'Fetching...' : 'Auto-fetch'}
                  </button>
                  <button
                    onClick={handleSearch}
                    disabled={metadataLoading}
                    className="btn btn-secondary btn-sm"
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible info section */}
            <div className={`manga-info-collapsible ${showMore ? 'expanded' : ''}`}>
              {manga.author && <p className="meta-item"><strong>Author:</strong> {manga.author}</p>}
              {manga.artist && <p className="meta-item"><strong>Artist:</strong> {manga.artist}</p>}
              <p className="meta-item"><strong>Status:</strong> {manga.status}</p>
              <p className="meta-item"><strong>Type:</strong> {manga.mediaType}</p>
              <p className="meta-item"><strong>Chapters:</strong> {chapters.length}</p>
              {manga.genres && manga.genres.length > 0 && (
                <div className="meta-item">
                  <strong>Genres:</strong>
                  <div className="genres-inline">
                    {manga.genres.map(genre => (
                      <span key={genre} className="genre-tag-small">{genre}</span>
                    ))}
                  </div>
                </div>
              )}
              {manga.description && (
                <div className="manga-description">
                  <strong>Description:</strong>
                  <div 
                    className="description-content"
                    dangerouslySetInnerHTML={{ __html: manga.description }}
                  />
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowMore(!showMore)}
              className="btn btn-text show-more-btn"
            >
              {showMore ? 'Show less ↑' : 'Show more ↓'}
            </button>

            {/* Search results modal */}
            {showSearch && (
              <div className="search-results-overlay">
                <div className="search-results-modal">
                  <h4>Select from AniList results:</h4>
                  <div className="results-grid">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="result-card"
                        onClick={() => handleApplyMetadata(result.id)}
                      >
                        {result.coverImage && (
                          <img
                            src={result.coverImage.medium}
                            alt={result.title.romaji}
                            className="result-cover"
                          />
                        )}
                        <div className="result-info">
                          <h5>{result.title.english || result.title.romaji}</h5>
                          <p className="result-year">{result.year}</p>
                          <div className="result-genres">
                            {result.genres.slice(0, 3).map(g => (
                              <span key={g} className="genre-tag">{g}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowSearch(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chapters-section">
          <h2>Chapters</h2>
          {chapters.length === 0 ? (
            <p className="no-chapters">No chapters available</p>
          ) : (
            <div className="chapters-list">
              {chapters.map((chapter) => (
                <div 
                  key={chapter.id} 
                  className="chapter-item"
                  onClick={() => onReadChapter(chapter.id)}
                >
                  <span className="chapter-number">
                    Chapter {chapter.chapterNumber}
                  </span>
                  {chapter.title && (
                    <span className="chapter-title">{chapter.title}</span>
                  )}
                  <span className="chapter-pages">{chapter.pagesCount} pages</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
