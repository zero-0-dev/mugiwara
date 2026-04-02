import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PageInfo, ReadingProgress } from '@mugiwara/types';

interface ReaderProps {
  apiBaseUrl: string;
  mangaId: string;
  chapterId: string;
  onBack: () => void;
  onNextChapter?: () => void;
  onPrevChapter?: () => void;
}

type ReadingMode = 'rtl' | 'ltr' | 'vertical';

export function Reader({ 
  apiBaseUrl, 
  mangaId, 
  chapterId, 
  onBack,
  onNextChapter,
  onPrevChapter
}: ReaderProps) {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<ReadingMode>('rtl');
  const [showControls, setShowControls] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchPages();
    loadProgress();
  }, [chapterId, apiBaseUrl]);

  useEffect(() => {
    if (pages.length > 0 && !loading) {
      saveProgress();
    }
  }, [currentPage, pages.length, loading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
          readingMode === 'rtl' ? goToPrevPage() : goToNextPage();
          break;
        case 'ArrowLeft':
          readingMode === 'rtl' ? goToNextPage() : goToPrevPage();
          break;
        case ' ':
        case 'ArrowDown':
          e.preventDefault();
          readingMode === 'rtl' ? goToPrevPage() : goToNextPage();
          break;
        case 'Escape':
          onBack();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, pages.length, readingMode, onBack, onNextChapter, onPrevChapter]);

  async function fetchPages() {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}/chapters/${chapterId}/pages`);
      if (!response.ok) throw new Error('Failed to fetch pages');
      const data = await response.json();
      setPages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function loadProgress() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}/progress`);
      if (response.ok) {
        const progress: ReadingProgress = await response.json();
        if (progress.chapterId === chapterId && progress.pageNumber > 1) {
          setCurrentPage(progress.pageNumber - 1);
        }
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  }

  async function saveProgress() {
    try {
      await fetch(`${apiBaseUrl}/api/manga/${mangaId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId,
          pageNumber: currentPage + 1,
          totalPages: pages.length,
          isCompleted: currentPage === pages.length - 1
        })
      });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  }

  const goToNextPage = useCallback(() => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(prev => prev + 1);
    } else if (onNextChapter) {
      onNextChapter();
    }
  }, [currentPage, pages.length, onNextChapter]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    } else if (onPrevChapter) {
      onPrevChapter();
    }
  }, [currentPage, onPrevChapter]);

  const handleScreenClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
    
    if (readingMode === 'rtl') {
      if (x < width * 0.3) goToNextPage();
      else if (x > width * 0.7) goToPrevPage();
    } else {
      if (x < width * 0.3) goToPrevPage();
      else if (x > width * 0.7) goToNextPage();
    }
  };

  if (loading) {
    return (
      <div className="reader-loading">
        <div className="loading-spinner"></div>
        <p>Loading chapter...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reader-error">
        <p>{error}</p>
        <button onClick={onBack} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="reader-empty">
        <p>No pages found in this chapter</p>
        <button onClick={onBack} className="btn btn-primary">Go Back</button>
      </div>
    );
  }

  const currentPageData = pages[currentPage];

  return (
    <div 
      ref={containerRef}
      className={`reader reader-mode-${readingMode}`}
      onClick={handleScreenClick}
    >
      <div className={`reader-controls top-controls ${showControls ? 'visible' : ''}`}>
        <button onClick={onBack} className="btn btn-secondary">Back</button>
        <div className="reader-settings">
          <select 
            value={readingMode} 
            onChange={(e) => setReadingMode(e.target.value as ReadingMode)}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="rtl">Right to Left (Manga)</option>
            <option value="ltr">Left to Right</option>
            <option value="vertical">Vertical (Webtoon)</option>
          </select>
        </div>
        <div className="page-indicator">
          {currentPage + 1} / {pages.length}
        </div>
      </div>

      <div className="reader-content">
        {readingMode === 'vertical' ? (
          <div className="vertical-pages">
            {pages.map((page, index) => (
              <img
                key={index}
                src={`${apiBaseUrl}${page.url}`}
                alt={`Page ${index + 1}`}
                className="manga-page vertical"
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <img
            src={`${apiBaseUrl}${currentPageData.url}`}
            alt={`Page ${currentPage + 1}`}
            className="manga-page"
          />
        )}
      </div>

      <div className={`reader-controls bottom-controls ${showControls ? 'visible' : ''}`}>
        <button 
          onClick={(e) => { e.stopPropagation(); goToPrevPage(); }}
          disabled={currentPage === 0 && !onPrevChapter}
          className="btn btn-secondary"
        >
          Previous
        </button>
        
        <div className="progress-bar-container">
          <div 
            className="progress-bar" 
            style={{ width: `${((currentPage + 1) / pages.length) * 100}%` }}
          />
        </div>
        
        <button 
          onClick={(e) => { e.stopPropagation(); goToNextPage(); }}
          disabled={currentPage === pages.length - 1 && !onNextChapter}
          className="btn btn-primary"
        >
          Next
        </button>
      </div>

      <div className="click-zones">
        <div className="click-zone prev-zone" />
        <div className="click-zone menu-zone" />
        <div className="click-zone next-zone" />
      </div>
    </div>
  );
}
