import React, { useEffect, useState } from "react";
import { Library } from "./components/Library";
import { MangaDetail } from "./components/MangaDetail";
import { Reader } from "./components/Reader";
import { SettingsPage } from "./components/SettingsPage";
import { Manga, Chapter } from "@mugiwara/types";

type View = "library" | "manga-detail" | "reader" | "settings";

function App() {
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>("library");
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);

  useEffect(() => {
    async function init() {
      try {
        const port = await window.electronAPI.getServerPort();
        const baseUrl = await window.electronAPI.getApiUrl("");

        setServerPort(port);
        setApiBaseUrl(baseUrl);
        setLoading(false);
      } catch (err) {
        setError("Failed to connect to server");
        setLoading(false);
      }
    }

    init();
  }, []);

  const handleMangaSelect = (mangaId: string) => {
    setSelectedMangaId(mangaId);
    setCurrentView("manga-detail");
  };

  const handleReadChapter = (chapterId: string, chaptersList?: Chapter[]) => {
    setSelectedChapterId(chapterId);
    if (chaptersList) {
      setChapters(chaptersList);
    }
    setCurrentView("reader");
  };

  const handleNextChapter = () => {
    if (!selectedChapterId || chapters.length === 0) return;

    const currentIndex = chapters.findIndex(
      (ch) => ch.id === selectedChapterId,
    );
    if (currentIndex < chapters.length - 1) {
      const nextChapter = chapters[currentIndex + 1];
      setInitialPage(0); // Start from first page of next chapter
      setSelectedChapterId(nextChapter.id);
    }
  };

  const handlePrevChapter = () => {
    if (!selectedChapterId || chapters.length === 0) return;

    const currentIndex = chapters.findIndex(
      (ch) => ch.id === selectedChapterId,
    );
    if (currentIndex > 0) {
      const prevChapter = chapters[currentIndex - 1];
      setInitialPage(-1); // -1 means "last page" of previous chapter
      setSelectedChapterId(prevChapter.id);
    }
  };

  const handleBackToLibrary = () => {
    setCurrentView("library");
    setSelectedMangaId(null);
    setSelectedChapterId(null);
  };

  const handleBackToDetail = () => {
    setCurrentView("manga-detail");
    setSelectedChapterId(null);
  };

  const handleOpenSettings = () => {
    setCurrentView("settings");
  };

  const handleCloseSettings = () => {
    setCurrentView("library");
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
      case "library":
        return (
          <Library apiBaseUrl={apiBaseUrl} onMangaSelect={handleMangaSelect} />
        );
      case "manga-detail":
        return selectedMangaId ? (
          <MangaDetail
            apiBaseUrl={apiBaseUrl}
            mangaId={selectedMangaId}
            onBack={handleBackToLibrary}
            onReadChapter={handleReadChapter}
          />
        ) : null;
      case "reader":
        return selectedMangaId && selectedChapterId ? (
          <Reader
            apiBaseUrl={apiBaseUrl}
            mangaId={selectedMangaId}
            chapterId={selectedChapterId}
            onBack={handleBackToDetail}
            onNextChapter={handleNextChapter}
            onPrevChapter={handlePrevChapter}
            initialPage={initialPage}
            onInitialPageUsed={() => setInitialPage(undefined)}
          />
        ) : null;
      case "settings":
        return (
          <SettingsPage apiBaseUrl={apiBaseUrl} onBack={handleCloseSettings} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={handleBackToLibrary} style={{ cursor: "pointer" }}>
          Mugiwara
        </h1>
        <div className="header-actions">
          <button
            onClick={handleOpenSettings}
            className="btn btn-icon"
            title="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <span className="server-status">Server: localhost:{serverPort}</span>
        </div>
      </header>
      <main className="app-main">{renderContent()}</main>
    </div>
  );
}

export default App;
