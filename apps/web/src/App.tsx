import React, { useEffect, useState } from "react";
import { BookOpen, Compass, Settings } from "lucide-react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { Library } from "./components/Library";
import { MangaDetail } from "./components/MangaDetail";
import { Reader } from "./components/Reader";
import { SettingsPage } from "./components/SettingsPage";
import { Discover } from "./components/Discover";
import { DiscoverDetail } from "./components/DiscoverDetail";
import { ServerSetup } from "./components/ServerSetup";
import { Manga, Chapter } from "@mugiwara-manga/types";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSettings } from "./api/hooks";
import { ApiClientProvider } from "./api/context";
import { ToastProvider } from "./components/Toast";
import {
  getStoredServerUrl,
  isCapacitor,
  resolveServer,
  saveStoredServerUrl,
} from "./platform/server";

export const THEME_STORAGE_KEY = "mugiwara.theme";

/** Keeps the browser theme-color and the native system bars in sync. */
function applyThemeChrome(theme: string) {
  const isDark = theme !== "light";
  document.documentElement.dataset.theme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", isDark ? "#1a1a1a" : "#f0ece8");

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the UI still works.
  }

  if (isCapacitor()) {
    void SystemBars.setStyle({
      style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => {
      // The browser and older native shells do not register this plugin.
    });
  }
}

function ThemeApplier() {
  const { data: settings } = useSettings();
  const theme = (settings as Record<string, string> | undefined)?.["ui.theme"];

  useEffect(() => {
    if (!theme) return;
    applyThemeChrome(theme);
  }, [theme]);

  return null;
}

type View = "library" | "manga-detail" | "reader" | "settings" | "discover" | "discover-detail";

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
  const [serverLabel, setServerLabel] = useState<string>("");
  const [needsServerSetup, setNeedsServerSetup] = useState(false);
  const [showServerSetup, setShowServerSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>("library");
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [selectedAnilistId, setSelectedAnilistId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const canChangeServer = isCapacitor();

  useKeyboardShortcuts([
    {
      key: ",",
      ctrl: true,
      action: () => setCurrentView("settings"),
    },
  ]);

  useEffect(() => {
    async function init() {
      try {
        const resolved = await resolveServer();
        setApiBaseUrl(resolved.baseUrl);
        setServerLabel(resolved.label);
        setNeedsServerSetup(resolved.needsSetup);
        setLoading(false);
      } catch {
        setError("Failed to connect to server");
        setLoading(false);
      }
    }

    init();
  }, []);

  const handleServerConnected = (url: string) => {
    saveStoredServerUrl(url);
    // Reload so every query and the API client start from the new origin.
    window.location.reload();
  };

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
      if (!nextChapter) return;
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
      if (!prevChapter) return;
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

  const handleOpenDiscover = () => {
    setCurrentView("discover");
  };

  const handleDiscoverMangaSelect = (anilistId: number) => {
    setSelectedAnilistId(anilistId);
    setCurrentView("discover-detail");
  };

  const handleBackFromDiscover = () => {
    setCurrentView("discover");
    setSelectedAnilistId(null);
  };

  const handleBackFromDiscoverToLibrary = () => {
    setCurrentView("library");
    setSelectedAnilistId(null);
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

  if (needsServerSetup || showServerSetup) {
    return (
      <ServerSetup
        initialUrl={getStoredServerUrl()}
        canCancel={!needsServerSetup}
        onCancel={() => setShowServerSetup(false)}
        onConnected={handleServerConnected}
      />
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case "library":
        return <Library onMangaSelect={handleMangaSelect} />;
      case "discover":
        return <Discover onMangaSelect={handleDiscoverMangaSelect} />;
      case "discover-detail":
        return selectedAnilistId ? (
          <DiscoverDetail
            anilistId={selectedAnilistId}
            onBack={handleBackFromDiscover}
            onAddedToLibrary={handleBackFromDiscoverToLibrary}
          />
        ) : null;
      case "manga-detail":
        return selectedMangaId ? (
          <MangaDetail
            mangaId={selectedMangaId}
            onBack={handleBackToLibrary}
            onReadChapter={handleReadChapter}
          />
        ) : null;
      case "reader":
        return selectedMangaId && selectedChapterId ? (
          <Reader
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
          <SettingsPage
            onBack={handleCloseSettings}
            serverLabel={serverLabel}
            onChangeServer={
              canChangeServer ? () => setShowServerSetup(true) : undefined
            }
          />
        );
      default:
        return null;
    }
  };

  return (
    <ApiClientProvider baseUrl={apiBaseUrl}>
      <ThemeApplier />
      <ToastProvider>
      <div className={`app${currentView === "reader" ? " app-reader" : ""}`}>
        {currentView !== "reader" && (
          <header className="app-header">
            <h1 onClick={handleBackToLibrary} style={{ cursor: "pointer" }}>
              Mugiwara
            </h1>
            <div className="header-actions">
              <button
                onClick={handleBackToLibrary}
                className={`nav-btn ${currentView === "library" || currentView === "manga-detail" ? "active" : ""}`}
                aria-label="Library"
                aria-current={currentView === "library" || currentView === "manga-detail" ? "page" : undefined}
              >
                <BookOpen size={16} />
                Library
              </button>
              <button
                onClick={handleOpenDiscover}
                className={`nav-btn ${currentView === "discover" || currentView === "discover-detail" ? "active" : ""}`}
                aria-label="Discover"
                aria-current={currentView === "discover" || currentView === "discover-detail" ? "page" : undefined}
              >
                <Compass size={16} />
                Discover
              </button>
              <button
                onClick={handleOpenSettings}
                className={`btn btn-icon ${currentView === "settings" ? "active" : ""}`}
                title="Settings"
                aria-label="Settings"
                aria-current={currentView === "settings" ? "page" : undefined}
              >
                <Settings size={20} />
              </button>
              {canChangeServer ? (
                <button
                  className="server-status"
                  title="Change server"
                  onClick={() => setShowServerSetup(true)}
                >
                  Server: {serverLabel || "not set"}
                </button>
              ) : (
                <span className="server-status">
                  Server: {serverLabel || "local"}
                </span>
              )}
            </div>
          </header>
        )}
        <main className="app-main">{renderContent()}</main>
      </div>
      </ToastProvider>
    </ApiClientProvider>
  );
}

export default App;
