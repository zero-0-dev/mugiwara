import React, { useEffect, useState } from "react";
import { BookOpen, Compass, Settings } from "lucide-react";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { Library } from "./components/Library";
import { MangaDetail } from "./components/MangaDetail";
import { Reader } from "./components/Reader";
import { SettingsPage } from "./components/SettingsPage";
import { DiskSpacePage } from "./components/DiskSpacePage";
import { Discover } from "./components/Discover";
import { DiscoverDetail } from "./components/DiscoverDetail";
import { ServerSetup } from "./components/ServerSetup";
import { Chapter } from "@mugiwara-manga/types";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSettings } from "./api/hooks";
import { ApiClientProvider } from "./api/context";
import { ToastProvider } from "./components/Toast";
import { Button } from "./components/ui/button";
import brandMark from "./assets/mugiwara-mark.png";
import { cn } from "./lib/utils";
import {
  clearStoredAuthToken,
  getStoredServerUrl,
  isCapacitor,
  resolveServer,
  saveStoredAuthToken,
  saveStoredServerUrl,
} from "./platform/server";

export const THEME_STORAGE_KEY = "mugiwara.theme";

/** Keeps the browser theme-color and the native system bars in sync. */
function applyThemeChrome(theme: string) {
  const isDark = theme !== "light";
  document.documentElement.dataset.theme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", isDark ? "#171717" : "#f4f1ed");

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

type View =
  | "library"
  | "manga-detail"
  | "reader"
  | "settings"
  | "disk-space"
  | "discover"
  | "discover-detail";

function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={brandMark}
      alt=""
      aria-hidden="true"
      className={cn(
        "size-8 shrink-0 rounded-lg object-cover shadow-sm shadow-orange-950/40",
        className,
      )}
    />
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={typeof children === "string" ? children : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/15 text-brand-text"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [contentToken, setContentToken] = useState<string | null>(null);
  const [serverLabel, setServerLabel] = useState<string>("");
  const [needsServerSetup, setNeedsServerSetup] = useState(false);
  const [showServerSetup, setShowServerSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>("library");
  const [selectedMangaId, setSelectedMangaId] = useState<string | null>(null);
  const [selectedAnilistId, setSelectedAnilistId] = useState<number | null>(
    null,
  );
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [initialPage, setInitialPage] = useState<number | undefined>(undefined);
  const [, setReaderImmersive] = useState(false);
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
        setAuthToken(resolved.authToken);
        setContentToken(resolved.contentToken);
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

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredAuthToken(apiBaseUrl);
      setAuthToken(null);
      setContentToken(null);
      setNeedsServerSetup(true);
    };
    window.addEventListener("mugiwara:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("mugiwara:unauthorized", handleUnauthorized);
  }, [apiBaseUrl]);

  const handleServerConnected = (url: string, token: string) => {
    saveStoredAuthToken(url, token);
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

  const handleOpenDiskSpace = () => {
    setCurrentView("disk-space");
  };

  const handleCloseDiskSpace = () => {
    setCurrentView("settings");
  };

  if (loading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground">
        <BrandMark className="size-12 rounded-2xl" />
        <div className="loading-spinner" />
        <p className="text-sm text-muted-foreground">Starting Mugiwara...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold text-destructive-text">
            Could not start
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button
            className="mt-5 w-full"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (needsServerSetup || showServerSetup) {
    return (
      <ServerSetup
        initialUrl={
          apiBaseUrl ||
          getStoredServerUrl() ||
          (typeof window !== "undefined" ? window.location.origin : "")
        }
        canCancel={!needsServerSetup}
        lockUrl={!canChangeServer}
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
      case "reader": {
        const selectedChapterIndex = chapters.findIndex(
          (chapter) => chapter.id === selectedChapterId,
        );
        const hasPrevChapter = selectedChapterIndex > 0;
        const hasNextChapter =
          selectedChapterIndex >= 0 &&
          selectedChapterIndex < chapters.length - 1;

        return selectedMangaId && selectedChapterId ? (
          <Reader
            mangaId={selectedMangaId}
            chapterId={selectedChapterId}
            onBack={handleBackToDetail}
            onNextChapter={hasNextChapter ? handleNextChapter : undefined}
            onPrevChapter={hasPrevChapter ? handlePrevChapter : undefined}
            initialPage={initialPage}
            onInitialPageUsed={() => setInitialPage(undefined)}
            onImmersiveChange={setReaderImmersive}
          />
        ) : null;
      }
      case "settings":
        return (
          <SettingsPage
            onBack={handleCloseSettings}
            serverLabel={serverLabel}
            onChangeServer={
              canChangeServer ? () => setShowServerSetup(true) : undefined
            }
            onOpenDiskSpace={handleOpenDiskSpace}
          />
        );
      case "disk-space":
        return <DiskSpacePage onBack={handleCloseDiskSpace} />;
      default:
        return null;
    }
  };

  const isReader = currentView === "reader";
  const isLibrarySection =
    currentView === "library" || currentView === "manga-detail";
  const isDiscoverSection =
    currentView === "discover" || currentView === "discover-detail";

  return (
    <ApiClientProvider
      baseUrl={apiBaseUrl}
      authToken={authToken}
      contentToken={contentToken}
    >
      <ThemeApplier />
      <ToastProvider>
        <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
          {!isReader && (
            <header className="electron-drag z-40 shrink-0 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
              <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 pl-[max(1rem,var(--titlebar-inset-left),env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
                <button
                  onClick={handleBackToLibrary}
                  className="electron-no-drag flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Mugiwara home"
                >
                  <BrandMark />
                  <span className="text-base font-semibold tracking-tight">
                    Mugiwara
                  </span>
                </button>

                <nav className="electron-no-drag ml-2 hidden items-center gap-1 sm:flex">
                  <NavButton
                    active={isLibrarySection}
                    onClick={handleBackToLibrary}
                    icon={<BookOpen className="size-4" />}
                  >
                    Library
                  </NavButton>
                  <NavButton
                    active={isDiscoverSection}
                    onClick={handleOpenDiscover}
                    icon={<Compass className="size-4" />}
                  >
                    Discover
                  </NavButton>
                </nav>

                <div className="electron-no-drag ml-auto flex items-center gap-2">
                  <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-success-text md:inline-flex">
                    <span className="size-1.5 rounded-full bg-emerald-400" />
                    {serverLabel || "local"}
                  </span>
                  <Button
                    variant={currentView === "settings" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={handleOpenSettings}
                    title="Settings"
                    aria-label="Settings"
                    aria-current={
                      currentView === "settings" ? "page" : undefined
                    }
                  >
                    <Settings className="size-5" />
                  </Button>
                </div>
              </div>
            </header>
          )}

          <main
            className={cn(
              "min-h-0 flex-1",
              isReader ? "overflow-hidden" : "overflow-y-auto scrollbar-thin",
              !isReader &&
                "pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0",
            )}
          >
            {renderContent()}
          </main>

          {!isReader && (
            <nav
              aria-label="Primary"
              className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 pt-1.5 backdrop-blur-xl sm:hidden"
            >
              <div className="mx-auto grid max-w-md grid-cols-3">
                <button
                  onClick={handleBackToLibrary}
                  aria-current={isLibrarySection ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isLibrarySection
                      ? "text-brand-text"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <BookOpen className="size-5" />
                  Library
                </button>
                <button
                  onClick={handleOpenDiscover}
                  aria-current={isDiscoverSection ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isDiscoverSection
                      ? "text-brand-text"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Compass className="size-5" />
                  Discover
                </button>
                <button
                  onClick={handleOpenSettings}
                  aria-current={currentView === "settings" ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    currentView === "settings"
                      ? "text-brand-text"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Settings className="size-5" />
                  Settings
                </button>
              </div>
            </nav>
          )}
        </div>
      </ToastProvider>
    </ApiClientProvider>
  );
}

export default App;
