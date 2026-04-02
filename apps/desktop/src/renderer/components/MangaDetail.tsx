import React, { useEffect, useState } from 'react';
import { Manga, Chapter } from '@mugiwara/types';

interface MangaDetailProps {
  apiBaseUrl: string;
  mangaId: string;
  onBack: () => void;
  onReadChapter: (chapterId: string) => void;
}

export function MangaDetail({ apiBaseUrl, mangaId, onBack, onReadChapter }: MangaDetailProps) {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMangaDetail();
  }, [mangaId, apiBaseUrl]);

  async function fetchMangaDetail() {
    try {
      setLoading(true);
      
      // Fetch manga details
      const mangaRes = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`);
      if (!mangaRes.ok) throw new Error('Failed to fetch manga');
      const mangaData = await mangaRes.json();
      setManga(mangaData);
      
      // Fetch chapters
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
              <img src={`${apiBaseUrl}${manga.coverImage}`} alt={manga.title} />
            ) : (
              <div className="placeholder-cover-large">
                <span>{manga.title.charAt(0)}</span>
              </div>
            )}
          </div>
          
          <div className="manga-meta">
            <h1 className="manga-title-large">{manga.title}</h1>
            {manga.author && <p className="meta-item"><strong>Author:</strong> {manga.author}</p>}
            {manga.artist && <p className="meta-item"><strong>Artist:</strong> {manga.artist}</p>}
            <p className="meta-item"><strong>Status:</strong> {manga.status}</p>
            <p className="meta-item"><strong>Type:</strong> {manga.mediaType}</p>
            <p className="meta-item"><strong>Chapters:</strong> {chapters.length}</p>
            {manga.description && (
              <div className="manga-description">
                <strong>Description:</strong>
                <p>{manga.description}</p>
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
