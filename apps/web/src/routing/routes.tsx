import { useCallback } from "react";
import {
  createBrowserRouter,
  useLocation,
  useNavigate,
  useParams,
  type RouteObject,
} from "react-router-dom";
import { Library } from "../components/Library";
import { MangaDetail } from "../components/MangaDetail";
import { Reader } from "../components/Reader";
import { Discover } from "../components/Discover";
import { DiscoverDetail } from "../components/DiscoverDetail";
import { SettingsPage } from "../components/SettingsPage";
import { DiskSpacePage } from "../components/DiskSpacePage";
import { NotFound } from "../components/NotFound";
import { useChapters } from "../api/hooks";
import { AppShell } from "./AppShell";
import { useAppChrome } from "./appChrome";
import { useBackOr } from "./navigation";

function LibraryRoute() {
  const navigate = useNavigate();
  return <Library onMangaSelect={(mangaId) => navigate(`/manga/${mangaId}`)} />;
}

function MangaDetailRoute() {
  const { mangaId = "" } = useParams();
  const navigate = useNavigate();
  const back = useBackOr("/");

  return (
    <MangaDetail
      mangaId={mangaId}
      onBack={back}
      onReadChapter={(chapterId) =>
        navigate(`/read/${mangaId}/${chapterId}`)
      }
    />
  );
}

interface ReaderLocationState {
  initialPage?: number;
}

function ReaderRoute() {
  const { mangaId = "", chapterId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const back = useBackOr(`/manga/${mangaId}`);
  const { data: chapters = [] } = useChapters(mangaId);

  const chapterIndex = chapters.findIndex(
    (chapter) => chapter.id === chapterId,
  );
  const hasPrevChapter = chapterIndex > 0;
  const hasNextChapter =
    chapterIndex >= 0 && chapterIndex < chapters.length - 1;
  const initialPage = (location.state as ReaderLocationState | null)
    ?.initialPage;

  const goToChapter = useCallback(
    (nextChapterId: string, page: number) => {
      navigate(`/read/${mangaId}/${nextChapterId}`, {
        replace: true,
        state: { initialPage: page } satisfies ReaderLocationState,
      });
    },
    [mangaId, navigate],
  );

  // Consume the one-shot initial page so a later back/forward does not jump
  // the freshly opened chapter to the previous chapter's edge.
  const clearInitialPage = useCallback(() => {
    if (!location.state) return;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [location.pathname, location.search, location.state, navigate]);

  return (
    <Reader
      mangaId={mangaId}
      chapterId={chapterId}
      onBack={back}
      onNextChapter={
        hasNextChapter
          ? () => {
              const next = chapters[chapterIndex + 1];
              if (next) goToChapter(next.id, 0);
            }
          : undefined
      }
      onPrevChapter={
        hasPrevChapter
          ? () => {
              const previous = chapters[chapterIndex - 1];
              if (previous) goToChapter(previous.id, -1);
            }
          : undefined
      }
      initialPage={initialPage}
      onInitialPageUsed={clearInitialPage}
    />
  );
}

function DiscoverRoute() {
  const navigate = useNavigate();
  return (
    <Discover
      onMangaSelect={(anilistId) => navigate(`/discover/${anilistId}`)}
    />
  );
}

function DiscoverDetailRoute() {
  const { anilistId } = useParams();
  const navigate = useNavigate();
  const back = useBackOr("/discover");
  const id = Number(anilistId);

  if (!Number.isFinite(id) || id <= 0) return <NotFound />;

  return (
    <DiscoverDetail
      anilistId={id}
      onBack={back}
      onAddedToLibrary={() => navigate("/", { replace: true })}
    />
  );
}

function SettingsRoute() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const back = useBackOr("/");
  const { serverLabel, canChangeServer, onChangeServer } = useAppChrome();

  return (
    <SettingsPage
      activeTab={tab}
      onTabChange={(nextTab) => navigate(`/settings/${nextTab}`)}
      onBack={back}
      serverLabel={serverLabel}
      onChangeServer={canChangeServer ? onChangeServer : undefined}
      onOpenDiskSpace={() => navigate("/disk-space")}
    />
  );
}

function DiskSpaceRoute() {
  const back = useBackOr("/settings/storage");
  return <DiskSpacePage onBack={back} />;
}

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <LibraryRoute /> },
      { path: "manga/:mangaId", element: <MangaDetailRoute /> },
      { path: "read/:mangaId/:chapterId", element: <ReaderRoute /> },
      { path: "discover", element: <DiscoverRoute /> },
      { path: "discover/:anilistId", element: <DiscoverDetailRoute /> },
      { path: "settings/:tab?", element: <SettingsRoute /> },
      { path: "disk-space", element: <DiskSpaceRoute /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}
