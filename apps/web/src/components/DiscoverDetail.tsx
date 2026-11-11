import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Search } from "lucide-react";
import { AddMangaModal } from "./AddMangaModal";
import { useDiscoverManga, useSources, useSearchSource } from "../api/hooks";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";

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
  const [addModalResult, setAddModalResult] = useState<SearchResult | null>(
    null,
  );
  const [addModalSource, setAddModalSource] = useState("");

  const { data: manga, isLoading, error } = useDiscoverManga(anilistId);
  const { data: sources = [] } = useSources();

  const title = manga ? manga.title.english || manga.title.romaji : "";

  const { data: searchResults = [], isFetching: searching } = useSearchSource(
    selectedSource,
    selectedSource && title ? title : "",
  );

  useEffect(() => {
    if (selectedSource || sources.length === 0) return;
    const remote = sources.filter((s: Source) => s.id !== "local");
    if (remote.length > 0) setSelectedSource(remote[0]!.id);
  }, [sources, selectedSource]);

  function handleOpenAddModal(result: SearchResult) {
    setAddModalSource(selectedSource || "");
    setAddModalResult(result);
    setShowAddModal(true);
  }

  function handleAddMangaSuccess() {
    setShowAddModal(false);
    onAddedToLibrary();
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-36" />
        <div className="flex gap-6">
          <Skeleton className="aspect-[2/3] w-40 shrink-0 rounded-2xl sm:w-56" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Manga not found"}
        </p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  const nativeTitle = manga.title.native;
  const remoteSources = sources.filter((s: Source) => s.id !== "local");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="size-4" /> Back to Discover
      </Button>

      <div className="mt-5 flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-56">
          <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-border/70 bg-secondary shadow-xl shadow-black/20">
            {manga.coverImage?.large ? (
              <img
                src={manga.coverImage.large}
                alt={title}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/30 to-secondary text-5xl font-bold text-muted-foreground">
                {title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {nativeTitle && nativeTitle !== title && (
            <p className="mt-1 text-sm text-muted-foreground">{nativeTitle}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {manga.averageScore && (
              <Badge variant="default">{manga.averageScore}%</Badge>
            )}
            <Badge variant="secondary">{manga.mediaType.toUpperCase()}</Badge>
            <Badge variant="outline" className="capitalize">
              {manga.status}
            </Badge>
            {manga.chapters && (
              <Badge variant="outline">{manga.chapters} chapters</Badge>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {manga.genres.map((genre) => (
              <Badge key={genre} variant="outline">
                {genre}
              </Badge>
            ))}
          </div>

          {manga.author && (
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">Author: </span>
              {manga.author}
            </p>
          )}
          {manga.artist && (
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">Artist: </span>
              {manga.artist}
            </p>
          )}

          {manga.description && (
            <div className="mt-3">
              <p
                className={cn(
                  "whitespace-pre-line text-sm leading-6 text-muted-foreground",
                  !showDescription && "line-clamp-4",
                )}
              >
                {manga.description.replace(/<[^>]*>/g, "")}
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowDescription(!showDescription)}
                className="mt-1 h-auto px-0"
              >
                {showDescription ? (
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

      {manga.tags && manga.tags.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold">Tags</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {manga.tags.slice(0, 15).map((tag: { name: string }) => (
              <Badge key={tag.name} variant="secondary">
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator className="my-7" />

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Add to Library</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Search for “{title}” in a source to add it to your library.
        </p>

        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
          {remoteSources.map((source: Source) => (
            <button
              key={source.id}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                selectedSource === source.id
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => setSelectedSource(source.id)}
            >
              {source.name}
            </button>
          ))}
        </div>

        {remoteSources.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            No remote manga sources are installed. Add a source plugin in
            Settings → Plugins.
          </p>
        )}

        {searching && (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-border/70 bg-card/50 py-8 text-sm text-muted-foreground">
            <div className="loading-spinner size-6" />
            Searching...
          </div>
        )}

        {!searching && searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Results
            </p>
            {searchResults.map((result: SearchResult) => (
              <button
                key={result.sourceMangaId}
                className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-2 text-left outline-none transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handleOpenAddModal(result)}
              >
                {result.coverImageUrl ? (
                  <img
                    src={result.coverImageUrl}
                    alt={result.title}
                    className="h-14 w-10 shrink-0 rounded-md bg-secondary object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-base font-bold text-muted-foreground">
                    {result.title.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {result.title}
                  </div>
                  {result.author && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {result.author}
                    </div>
                  )}
                </div>
                <Search className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {!searching && searchResults.length === 0 && !isLoading && (
          <p className="mt-4 rounded-xl border border-border/70 bg-card/50 p-5 text-center text-sm text-muted-foreground">
            No results found in this source.
          </p>
        )}
      </div>

      {showAddModal && addModalResult && (
        <AddMangaModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddMangaSuccess}
          onViewManga={() => setShowAddModal(false)}
          initialSourceId={addModalSource}
          initialSearchResult={addModalResult}
        />
      )}
    </div>
  );
}
