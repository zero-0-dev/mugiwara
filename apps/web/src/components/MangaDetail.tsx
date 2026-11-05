import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Download,
  EllipsisVertical,
  Loader,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Chapter, ReadingProgress } from "@mugiwara-manga/types";
import { useApiClient } from "../api/context";
import { useToast } from "./Toast";
import {
  useManga,
  useChapters,
  useAllChapterProgress,
  useMarkChapterComplete,
  useMarkChapterIncomplete,
  useDownloadChapter,
  useDeleteChapterDownload,
  useUpdateMangaTitle,
  useFetchMetadata,
  useApplyMetadata,
  useCheckMangaUpdates,
  useDownloadAllChapters,
  useDownloadQueueSync,
  useSources,
} from "../api/hooks";
import { CategoryPicker } from "./CategoryPicker";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Progress } from "./ui/progress";
import { Separator } from "./ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface MangaDetailProps {
  mangaId: string;
  onBack: () => void;
  onReadChapter: (chapterId: string) => void;
}

interface ChapterWithProgress extends Chapter {
  progress?: ReadingProgress;
  isRead?: boolean;
  isCurrent?: boolean;
  progressPercent?: number;
  downloadStatus?: "pending" | "downloading" | "complete" | "error" | "idle";
}

interface AniListResult {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  description: string;
  coverImage: { large: string; medium: string } | null;
  year: number | null;
  genres: string[];
}

function chapterLabel(chapter: { title?: string; chapterId: string }): string {
  const title = chapter.title?.trim();
  if (title) return title;
  return `Chapter ${chapter.chapterId}`;
}

export function MangaDetail({
  mangaId,
  onBack,
  onReadChapter,
}: MangaDetailProps) {
  const api = useApiClient();
  const toast = useToast();

  const { data: manga, isLoading, error: fetchError } = useManga(mangaId);
  const { data: chapters = [] } = useChapters(mangaId);
  const { data: allProgress = [] } = useAllChapterProgress(mangaId);
  const { data: sources = [] } = useSources();
  const sourceInfo = manga
    ? sources.find((s) => s.id === manga.sourceId)
    : undefined;
  const isSourceOnline = !!sourceInfo;
  const sourceName = sourceInfo?.name || manga?.sourceId || "Unknown";

  const markComplete = useMarkChapterComplete(mangaId);
  const markIncomplete = useMarkChapterIncomplete(mangaId);
  const downloadChapter = useDownloadChapter(mangaId);
  const deleteChapterDownload = useDeleteChapterDownload(mangaId);
  const updateTitle = useUpdateMangaTitle(mangaId);
  const fetchMetadata = useFetchMetadata(mangaId);
  const applyMetadata = useApplyMetadata(mangaId);
  const checkUpdates = useCheckMangaUpdates(mangaId);
  const downloadAll = useDownloadAllChapters(mangaId);

  useDownloadQueueSync(mangaId);

  const handleCheckUpdates = () => {
    checkUpdates.mutate(undefined, {
      onSuccess: (data) => {
        if (data.newChaptersFound > 0) {
          toast.success(
            `Found ${data.newChaptersFound} new chapter${data.newChaptersFound > 1 ? "s" : ""}! Queued for download.`,
          );
        } else {
          toast.success("No new chapters found.");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDownloadAll = () => {
    downloadAll.mutate(undefined, {
      onSuccess: (data) => {
        if (data.chaptersQueued > 0) {
          toast.success(
            `Queued ${data.chaptersQueued} chapter${data.chaptersQueued > 1 ? "s" : ""} for download.`,
          );
        } else {
          toast.success("No pending chapters to download.");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [searchResults, setSearchResults] = useState<AniListResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [imageCacheBuster, setImageCacheBuster] = useState(Date.now());
  const [searchingMetadata, setSearchingMetadata] = useState(false);
  const [chapterToDelete, setChapterToDelete] =
    useState<ChapterWithProgress | null>(null);

  const enrichedChapters = useMemo(() => {
    const progressMap = allProgress.reduce(
      (acc, p) => {
        if (p.chapterId) acc[p.chapterId] = p;
        return acc;
      },
      {} as Record<string, ReadingProgress>,
    );
    const mostRecentProgress = allProgress[0];
    const currentChapterId = mostRecentProgress?.chapterId;
    return chapters.map((chapter) => {
      const progress = progressMap[chapter.id];
      const isCurrent = chapter.id === currentChapterId;
      const isRead =
        progress?.isCompleted || (progress?.percentComplete || 0) >= 95;
      const progressPercent = Math.round(progress?.percentComplete || 0);
      return {
        ...chapter,
        progress,
        isRead,
        isCurrent,
        progressPercent: isRead ? 100 : progressPercent,
      } as ChapterWithProgress;
    });
  }, [chapters, allProgress]);

  const readChaptersCount = enrichedChapters.filter((c) => c.isRead).length;
  const hasPendingChapters = chapters.some((c) => c.importStatus === "pending");

  const handleContinueReading = () => {
    const firstIncomplete = enrichedChapters.find((c) => !c.isRead);
    if (firstIncomplete) onReadChapter(firstIncomplete.id);
    else if (chapters[0]) onReadChapter(chapters[0].id);
  };

  const getContinueReadingText = () => {
    const firstIncomplete = enrichedChapters.find((c) => !c.isRead);
    if (!firstIncomplete)
      return chapters.length > 0 ? "Read Again" : "Start Reading";
    const label = chapterLabel(firstIncomplete);
    if (
      firstIncomplete.progress &&
      firstIncomplete.progress.percentComplete > 0
    )
      return `Continue reading ${label}`;
    return `Start reading ${label}`;
  };

  const handleEditTitle = () => {
    if (manga) {
      setEditedTitle(manga.title);
      setIsEditingTitle(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle("");
  };

  const handleSaveTitle = async () => {
    if (!manga || !editedTitle.trim()) return;
    updateTitle.mutate(editedTitle.trim(), {
      onSuccess: () => setIsEditingTitle(false),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleAutoFetch = async () => {
    fetchMetadata.mutate(undefined, {
      onSuccess: () => setImageCacheBuster(Date.now()),
      onError: (err) => toast.error(err.message),
    });
  };

  const handleSearch = async () => {
    setSearchingMetadata(true);
    try {
      const response = await fetch(
        `${api.getBaseUrl()}/api/manga/${manga!.id}/metadata/search`,
      );
      if (!response.ok) throw new Error("Failed to search");
      const data = await response.json();
      setSearchResults(data.results);
      setShowSearch(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSearchingMetadata(false);
    }
  };

  const handleApplyMetadata = async (anilistId: number) => {
    applyMetadata.mutate(
      { anilistId },
      {
        onSuccess: () => {
          setShowSearch(false);
          setImageCacheBuster(Date.now());
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleMarkChapterComplete = (
    chapterId: string,
    markPrevious?: boolean,
  ) => {
    markComplete.mutate(
      { chapterId, markPrevious },
      {
        onSuccess: () => undefined,
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleMarkChapterIncomplete = (
    chapterId: string,
    markFollowing?: boolean,
  ) => {
    markIncomplete.mutate(
      { chapterId, markFollowing },
      {
        onSuccess: () => undefined,
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleDownloadChapter = (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    downloadChapter.mutate(chapterId, {
      onError: (err) => toast.error(err.message),
    });
  };

  const handleDeleteChapterDownload = () => {
    if (!chapterToDelete) return;
    const target = chapterToDelete;
    deleteChapterDownload.mutate(target.chapterId, {
      onSuccess: () => {
        setChapterToDelete(null);
        toast.success(`Deleted download for ${chapterLabel(target)}.`);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  useEffect(() => {
    setShowMore(false);
    setShowSearch(false);
  }, [mangaId]);

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 py-24 text-muted-foreground">
        <div className="loading-spinner" />
        <p className="text-sm">Loading manga details...</p>
      </div>
    );
  }

  if (fetchError || !manga) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <AlertCircle className="size-10 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {(fetchError as Error)?.message || "Manga not found"}
        </p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const getChapterDownloadStatus = (chapter: ChapterWithProgress) => {
    if (chapter.importStatus === "complete") return "complete";
    if (chapter.importStatus === "error") return "error";
    if (chapter.importStatus === "pending") return "pending";
    if (chapter.importStatus === "downloading") return "downloading";
    return "idle";
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back to Library
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={checkUpdates.isPending}
          >
            <RefreshCw
              className={cn(
                "size-3.5",
                checkUpdates.isPending && "animate-spin",
              )}
            />
            <span className="hidden sm:inline">
              {checkUpdates.isPending ? "Checking..." : "Check for Updates"}
            </span>
          </Button>
          {hasPendingChapters && (
            <Button
              variant="brand"
              size="sm"
              onClick={handleDownloadAll}
              disabled={downloadAll.isPending}
            >
              <Download className="size-3.5" />
              {downloadAll.isPending ? "Downloading..." : "Download All"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[104px_minmax(0,1fr)] items-start gap-x-4 gap-y-5 md:mt-5 md:grid-cols-[200px_minmax(0,1fr)] md:gap-x-6 lg:grid-cols-[224px_minmax(0,1fr)]">
        <div className="w-full md:row-span-2">
          <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-border/70 bg-secondary shadow-xl shadow-black/20">
            {manga.coverImage ? (
              <img
                src={api.getAssetUrl(manga.coverImage, imageCacheBuster)}
                alt={manga.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-indigo-500/30 to-secondary text-5xl font-bold text-muted-foreground">
                {manga.title.charAt(0)}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="text-lg font-semibold"
                    autoFocus
                    aria-label="Manga title"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveTitle}
                      disabled={updateTitle.isPending || !editedTitle.trim()}
                    >
                      {updateTitle.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={updateTitle.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <h1 className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-3xl">
                    {manga.title}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleEditTitle}
                    title="Edit title"
                    aria-label="Edit title"
                    className="mt-0.5 text-muted-foreground"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              )}
              <div className="no-scrollbar mt-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
                {manga.status && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 px-2 text-[11px] capitalize"
                  >
                    {manga.status}
                  </Badge>
                )}
                {manga.mediaType && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 px-2 text-[11px] capitalize"
                  >
                    {manga.mediaType}
                  </Badge>
                )}
                {manga.anilistId && (
                  <Badge
                    variant="success"
                    className="shrink-0 px-2 text-[11px]"
                  >
                    <Sparkles className="size-3" />
                    <span className="sm:hidden">AniList</span>
                    <span className="hidden sm:inline">
                      Synced with AniList
                    </span>
                  </Badge>
                )}
                <Badge
                  variant={isSourceOnline ? "success" : "warning"}
                  className="shrink-0 px-2 text-[11px]"
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isSourceOnline ? "bg-emerald-400" : "bg-amber-400",
                    )}
                  />
                  {sourceName}
                </Badge>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div className="hidden items-center gap-2 sm:flex">
                <Button
                  size="sm"
                  variant="brand"
                  onClick={handleAutoFetch}
                  disabled={fetchMetadata.isPending}
                >
                  <Sparkles className="size-3.5" />
                  {fetchMetadata.isPending ? "Fetching..." : "Auto-fetch"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSearch}
                  disabled={searchingMetadata}
                >
                  <Search className="size-3.5" />
                  {searchingMetadata ? "Searching..." : "Search"}
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="sm:hidden"
                    aria-label="Metadata actions"
                    title="Metadata actions"
                  >
                    <EllipsisVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleAutoFetch}
                    disabled={fetchMetadata.isPending}
                  >
                    <Sparkles />
                    {fetchMetadata.isPending
                      ? "Fetching..."
                      : "Auto-fetch metadata"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleSearch}
                    disabled={searchingMetadata}
                  >
                    <Search />
                    {searchingMetadata ? "Searching..." : "Search AniList"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-2">
          <div className="mt-1 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 md:mt-4">
            {manga.author && <MetaRow label="Author" value={manga.author} />}
            {manga.artist && <MetaRow label="Artist" value={manga.artist} />}
            <MetaRow label="Chapters" value={String(chapters.length)} />
            <MetaRow label="Source" value={sourceName} />
          </div>

          {manga.genres && manga.genres.length > 0 && (
            <div className="no-scrollbar mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 sm:mt-3 sm:flex-wrap sm:overflow-visible">
              {manga.genres.map((genre) => (
                <Badge key={genre} variant="outline" className="shrink-0">
                  {genre}
                </Badge>
              ))}
            </div>
          )}

          <CategoryPicker mangaId={mangaId} />

          {manga.description && (
            <div className="mt-3 sm:mt-4">
              <h2 className="text-sm font-semibold">Description</h2>
              <div
                className={cn(
                  "mt-1 text-sm leading-6 text-muted-foreground [&_br]:hidden [&_p]:mb-2",
                  !showMore && "line-clamp-2 sm:line-clamp-3",
                )}
                dangerouslySetInnerHTML={{ __html: manga.description }}
              />
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowMore(!showMore)}
                className="mt-1 h-auto px-0"
              >
                {showMore ? (
                  <>
                    Show less <ChevronUp className="size-3.5" />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown className="size-3.5" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Separator className="my-7" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Chapters</h2>
          {readChaptersCount > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {readChaptersCount} of {enrichedChapters.length} chapters read
            </p>
          )}
        </div>
        {readChaptersCount > 0 && (
          <Progress
            value={(readChaptersCount / enrichedChapters.length) * 100}
            className="h-1.5 w-36"
          />
        )}
      </div>

      {enrichedChapters.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-indigo-500/12 via-card to-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="brand"
              size="lg"
              onClick={handleContinueReading}
              className="justify-start sm:justify-center"
            >
              <Play className="size-4 fill-current" />
              {getContinueReadingText()}
            </Button>
            {readChaptersCount > 0 && (
              <Badge variant="secondary">
                {Math.round(
                  (readChaptersCount / enrichedChapters.length) * 100,
                )}
                % complete
              </Badge>
            )}
          </div>
        </div>
      )}

      {enrichedChapters.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No chapters available
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          {enrichedChapters.map((chapter, index) => {
            const downloadStatus = getChapterDownloadStatus(chapter);
            const isDownloaded =
              downloadStatus === "complete" || chapter.pagesCount > 0;
            return (
              <div
                key={chapter.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent sm:px-4",
                  index > 0 && "border-t border-border/60",
                  chapter.isCurrent && "bg-indigo-500/5",
                )}
                onClick={() => onReadChapter(chapter.id)}
                role="button"
                tabIndex={0}
                aria-label={`Read ${chapterLabel(chapter)}`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onReadChapter(chapter.id);
                  }
                }}
              >
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border",
                    chapter.isRead
                      ? "border-emerald-500/30 bg-emerald-500/15 text-success-text"
                      : chapter.isCurrent
                        ? "border-primary/40 bg-primary/15 text-brand-text"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {chapter.isRead ? (
                    <Check className="size-4" />
                  ) : chapter.isCurrent ? (
                    <Play className="size-3.5 fill-current" />
                  ) : (
                    <Circle className="size-3.5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        chapter.isRead && "text-muted-foreground",
                      )}
                    >
                      {chapterLabel(chapter)}
                    </span>
                    {chapter.isCurrent && !chapter.isRead && (
                      <Badge variant="default" className="shrink-0">
                        Reading
                      </Badge>
                    )}
                    {chapter.isRead && (
                      <Badge
                        variant="success"
                        className="shrink-0 px-2 text-[11px]"
                      >
                        Read
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {chapter.pagesCount > 0
                        ? `${chapter.pagesCount} pages`
                        : "Not downloaded"}
                    </span>
                    {chapter.progressPercent !== undefined &&
                      chapter.progressPercent > 0 &&
                      !chapter.isRead && (
                        <span className="inline-flex items-center gap-1.5">
                          <Progress
                            value={chapter.progressPercent}
                            className="h-1 w-16"
                          />
                          {chapter.progressPercent}%
                        </span>
                      )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => handleDownloadChapter(chapter.chapterId, e)}
                    disabled={
                      downloadStatus === "downloading" ||
                      downloadStatus === "pending"
                    }
                    title={
                      downloadStatus === "complete"
                        ? "Downloaded"
                        : downloadStatus === "downloading"
                          ? "Downloading..."
                          : downloadStatus === "error"
                            ? "Download failed"
                            : downloadStatus === "pending"
                              ? "Queued"
                              : "Download chapter"
                    }
                    aria-label="Download chapter"
                    className={cn(
                      downloadStatus === "complete" && "text-success-text",
                      downloadStatus === "error" && "text-destructive-text",
                      downloadStatus === "pending" && "text-warning-text",
                    )}
                  >
                    {downloadStatus === "complete" ? (
                      <Check className="size-4" />
                    ) : downloadStatus === "downloading" ? (
                      <Loader className="size-4 animate-spin" />
                    ) : downloadStatus === "error" ? (
                      <AlertCircle className="size-4" />
                    ) : downloadStatus === "pending" ? (
                      <Clock className="size-4" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => e.stopPropagation()}
                        title="Chapter options"
                        aria-label="Chapter options"
                      >
                        <EllipsisVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!chapter.isRead ? (
                        <DropdownMenuItem
                          onClick={() => handleMarkChapterComplete(chapter.id)}
                        >
                          <Check /> Mark as Read
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            handleMarkChapterIncomplete(chapter.id)
                          }
                        >
                          <Circle /> Mark as Unread
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          handleMarkChapterComplete(chapter.id, true)
                        }
                      >
                        <CheckCheck /> Mark All Previous as Read
                      </DropdownMenuItem>
                      {chapter.isRead && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleMarkChapterIncomplete(chapter.id, true)
                          }
                        >
                          <Circle /> Mark All Following as Unread
                        </DropdownMenuItem>
                      )}
                      {isDownloaded && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive-text focus:text-destructive-text"
                            onClick={() => setChapterToDelete(chapter)}
                          >
                            <Trash2 /> Delete download
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="max-sm:px-4 max-sm:pt-4">
            <DialogTitle>Select from AniList results</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 max-sm:px-4">
            {searchResults.map((result) => (
              <button
                key={result.id}
                className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/40 p-2 text-left outline-none transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handleApplyMetadata(result.id)}
              >
                {result.coverImage && (
                  <img
                    src={result.coverImage.medium}
                    alt={result.title.romaji}
                    className="h-24 w-16 shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">
                    {result.title.english || result.title.romaji}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {result.year || "Unknown year"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {result.genres.slice(0, 3).map((genre) => (
                      <Badge key={genre} variant="outline">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {searchResults.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(chapterToDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteChapterDownload.isPending) {
            setChapterToDelete(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader className="max-sm:px-4 max-sm:pt-4">
            <DialogTitle>Delete downloaded chapter?</DialogTitle>
          </DialogHeader>
          {chapterToDelete && (
            <div className="space-y-3 text-sm max-sm:px-4">
              <p>
                This removes the downloaded files for{" "}
                <span className="font-medium">
                  {chapterLabel(chapterToDelete)}
                </span>
                .
              </p>
              <p className="text-muted-foreground">
                Reading progress and read/unread state are kept. You can
                download the chapter again later.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setChapterToDelete(null)}
                  disabled={deleteChapterDownload.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteChapterDownload}
                  disabled={deleteChapterDownload.isPending}
                >
                  {deleteChapterDownload.isPending ? (
                    <>
                      <Loader className="size-4 animate-spin" /> Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" /> Delete download
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate capitalize">{value}</span>
    </div>
  );
}
