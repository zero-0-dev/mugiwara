import React, { useEffect, useState } from 'react';
import { Library } from './components/Library';
import { MangaDetail } from './components/MangaDetail';
import { Reader } from './components/Reader';
import { Manga } from '@mugiwara/types';

type View = 'library' | 'manga-detail' | 'reader';

function App() {
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>('library');
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const port = await window.electronAPI.getServerPort();
        const baseUrl = await window.electronAPI.getApiUrl('');
        
        setServerPort(port);
        setApiBaseUrl(baseUrl);
        setLoading(false);
      } catch (err) {
        setError('Failed to connect to server');
        setLoading(false);
      }
    }

    init();
  }, []);

  const handleMangaSelect = (mangaId: string) => {
    setSelectedMangaId(mangaId);
    setCurrentView('manga-detail');
  };

  const handleReadChapter = (chapterId: string) => {
    setSelectedChapterId(chapterId);
    setCurrentView('reader');
  };

  const handleBackToLibrary = () => {
    setCurrentView('library');
    setSelectedMangaId(null);
    setSelectedChapterId(null);
  };

  const handleBackToDetail = () => {
    setCurrentView('manga-detail');
    setSelectedChapterId(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Starting Mugiwara...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h1>Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case 'library':
        return (
          <Library 
            apiBaseUrl={apiBaseUrl} 
            onMangaSelect={handleMangaSelect}
          />
        );
      case 'manga-detail':
        return selectedMangaId ? (
          <MangaDetail
            apiBaseUrl={apiBaseUrl}
            mangaId={selectedMangaId}
            onBack={handleBackToLibrary}
            onReadChapter={handleReadChapter}
          />
        ) : null;
      case 'reader':
        return selectedMangaId && selectedChapterId ? (
          <Reader
            apiBaseUrl={apiBaseUrl}
            mangaId={selectedMangaId}
            chapterId={selectedChapterId}
            onBack={handleBackToDetail}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={handleBackToLibrary} style={{ cursor: 'pointer' }}>Mugiwara</h1>
        <span className="server-status">Server: localhost:{serverPort}</span>
      </header>
      <main className="app-main">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
