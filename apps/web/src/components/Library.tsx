import React, { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "./Toast";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useDebounce } from "../hooks/useDebounce";
import { AddMangaModal } from "./AddMangaModal";
import {
  useLibrary,
  useFilterOptions,
  useDeleteManga,
  useCheckLibraryUpdates,
} from "../api/hooks";
import { useApiClient } from "../api/context";
import { Select } from "./Select";
import {
  libraryFiltersFromQuery,
  parseLibraryQuery,
  saveLastLibraryPath,
  updateLibraryQuery,
} from "../routing/librarySearch";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { cn } from "@/lib/utils";

interface LibraryProps {
  onMangaSelect: (mangaId: string) => void;
}

interface LibraryFilters {
  status: string;
  mediaType: string;
  genre: string;
  category: string;
  readingStatus: string;
}

export function Library({ onMangaSelect }: LibraryProps) {
  const api = useApiClient();
  const toast = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = parseLibraryQuery(searchParams);
  const [searchInput, setSearchInput] = useState(query.search);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddManga, setShowAddManga] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 250);
  const lastWrittenSearch = useRef<string | null>(null);

  // Keep the filtered library in session storage so the mobile Library tab
  // returns to the same query instead of resetting the list.
  useEffect(() => {
    saveLastLibraryPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  // The URL is the source of truth. A back/forward or a shared link updates
  // the visible search box; typing updates the URL with replace so keystrokes
  // never fill the history stack.
  useEffect(() => {
    if (query.search === lastWrittenSearch.current) return;
    setSearchInput(query.search);
  }, [query.search]);

  useEffect(() => {
    if (debouncedSearch === query.search) return;
    lastWrittenSearch.current = debouncedSearch;
    setSearchParams(
      updateLibraryQuery(searchParams, { search: debouncedSearch }),
      { replace: true },
    );
  }, [debouncedSearch, query.search, searchParams, setSearchParams]);

  const filters = {
    status: query.status,
    mediaType: query.mediaType,
    genre: query.genre,
    category: query.category,
    readingStatus: query.readingStatus,
  };
  const sortBy = query.sortBy;
  const sortOrder = query.sortOrder;

  function updateQuery(
    patch: Parameters<typeof updateLibraryQuery>[1],
    replace = false,
  ) {
    setSearchParams(updateLibraryQuery(searchParams, patch), { replace });
  }

  function setFilters(next: LibraryFilters) {
    updateQuery({
      status: next.status,
      mediaType: next.mediaType,
      genre: next.genre,
      category: next.category,
      readingStatus: next.readingStatus,
    });
  }

  function setSortBy(next: string) {
    updateQuery({ sortBy: next });
  }

  function setSortOrder(next: "asc" | "desc") {
    updateQuery({ sortOrder: next });
  }

  const queryFilters = {
    ...libraryFiltersFromQuery(query),
    search: debouncedSearch || undefined,
  };

  const { data: manga = [], isLoading } = useLibrary(queryFilters);
  const { data: filterOptions } = useFilterOptions();
  const deleteManga = useDeleteManga();
  const checkLibraryUpdates = useCheckLibraryUpdates();

  const handleCheckUpdates = () => {
    checkLibraryUpdates.mutate(undefined, {
      onSuccess: (data) => {
        if (data.newChaptersTotal > 0) {
          toast.success(
            `Found ${data.newChaptersTotal} new chapter${data.newChaptersTotal > 1 ? "s" : ""} across ${data.updated} manga!`,
          );
        } else {
          toast.success("All manga are up to date.");
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      action: () => setShowAddManga(true),
      enabled: !showAddManga,
    },
  ]);

  async function handleDeleteManga(
    mangaId: string,
    title: string,
    event: React.MouseEvent,
  ) {
    event.stopPropagation();
    if (
      !window.confirm(
        `Are you sure you want to remove "${title}" from your library?`,
      )
    )
      return;
    deleteManga.mutate(mangaId, {
      onError: (err) => toast.error((err as Error).message),
    });
  }

  function clearFilters() {
    setSearchInput("");
    lastWrittenSearch.current = "";
    setSearchParams(new URLSearchParams());
  }

  const activeFilterCount = [
    filters.status,
    filters.mediaType,
    filters.genre,
    filters.category,
    filters.readingStatus !== "all" ? filters.readingStatus : "",
  ].filter(Boolean).length;

  const hasActiveFilters = Boolean(searchInput) || activeFilterCount > 0;

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-secondary" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-secondary" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="aspect-[2/3] animate-pulse rounded-xl bg-secondary" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-3xl">
              Library
            </h1>
            <span className="text-xs text-muted-foreground sm:hidden">
              {manga.length} title{manga.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            {manga.length} title{manga.length === 1 ? "" : "s"} in your
            collection
            {hasActiveFilters ? " matching your filters" : ""}.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={handleCheckUpdates}
            disabled={checkLibraryUpdates.isPending}
            className="size-10 px-0 sm:w-auto sm:px-4"
            aria-label="Check for updates"
            title="Check for updates"
          >
            <RefreshCw
              className={cn(
                "size-4",
                checkLibraryUpdates.isPending && "animate-spin",
              )}
            />
            <span className="hidden sm:inline">Check for Updates</span>
          </Button>
          <Button variant="brand" onClick={() => setShowAddManga(true)}>
            <Plus className="size-4" />
            <span className="hidden xs:inline">Add Manga</span>
            <span className="xs:hidden">Add</span>
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5 rounded-xl border border-border/80 bg-card/70 p-1.5 shadow-sm sm:mt-6 sm:gap-2 sm:rounded-2xl sm:p-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search..."
            aria-label="Search library"
            className="h-9 border-0 bg-transparent pl-9 pr-9 text-sm shadow-none focus-visible:ring-0"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                lastWrittenSearch.current = "";
                updateQuery({ search: "" }, true);
              }}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-label="Filters"
          title="Filters"
          className="relative h-8 shrink-0 gap-1.5 px-2 sm:px-3"
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px] sm:static sm:ml-1">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
        <Select
          value={sortBy}
          onChange={setSortBy}
          className="h-9 w-[7.25rem] shrink-0 text-xs sm:w-[8.5rem] sm:text-sm"
          aria-label="Sort library"
          options={[
            { value: "lastRead", label: "Last Read" },
            { value: "title", label: "Title" },
            { value: "dateAdded", label: "Date Added" },
            { value: "progress", label: "Progress" },
            { value: "chapterCount", label: "Chapter Count" },
          ]}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
          aria-label={sortOrder === "asc" ? "Ascending" : "Descending"}
          className="shrink-0"
        >
          {sortOrder === "asc" ? (
            <ArrowUp className="size-4" />
          ) : (
            <ArrowDown className="size-4" />
          )}
        </Button>
      </div>

      {showFilters && (
        <div className="mt-3 rounded-2xl border border-border/80 bg-card/60 p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <FilterGroup label="Status">
              <Select
                value={filters.status}
                onChange={(v) => setFilters({ ...filters, status: v })}
                aria-label="Filter by status"
                options={[
                  { value: "", label: "All" },
                  { value: "ongoing", label: "Ongoing" },
                  { value: "completed", label: "Completed" },
                  { value: "hiatus", label: "Hiatus" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
            </FilterGroup>
            <FilterGroup label="Type">
              <Select
                value={filters.mediaType}
                onChange={(v) => setFilters({ ...filters, mediaType: v })}
                aria-label="Filter by type"
                options={[
                  { value: "", label: "All" },
                  { value: "manga", label: "Manga" },
                  { value: "manhwa", label: "Manhwa" },
                  { value: "manhua", label: "Manhua" },
                  { value: "webtoon", label: "Webtoon" },
                ]}
              />
            </FilterGroup>
            <FilterGroup label="Reading Status">
              <Select
                value={filters.readingStatus}
                onChange={(v) => setFilters({ ...filters, readingStatus: v })}
                aria-label="Filter by reading status"
                options={[
                  { value: "all", label: "All" },
                  { value: "reading", label: "Reading" },
                  { value: "completed", label: "Completed" },
                  { value: "not-started", label: "Not Started" },
                ]}
              />
            </FilterGroup>
            <FilterGroup label="Genre">
              <Select
                value={filters.genre}
                onChange={(v) => setFilters({ ...filters, genre: v })}
                aria-label="Filter by genre"
                options={[
                  { value: "", label: "All Genres" },
                  ...[
                    "Action",
                    "Adventure",
                    "Comedy",
                    "Drama",
                    "Fantasy",
                    "Horror",
                    "Mystery",
                    "Romance",
                    "Sci-Fi",
                    "Slice of Life",
                    "Sports",
                    "Thriller",
                  ].map((genre) => ({ value: genre, label: genre })),
                ]}
              />
            </FilterGroup>
            <FilterGroup label="Category">
              <Select
                value={filters.category}
                onChange={(v) => setFilters({ ...filters, category: v })}
                aria-label="Filter by category"
                options={[
                  { value: "", label: "All Categories" },
                  ...(filterOptions?.categories?.map(
                    (cat: { id: string; name: string }) => ({
                      value: cat.id,
                      label: cat.name,
                    }),
                  ) || []),
                ]}
              />
            </FilterGroup>
          </div>
          {hasActiveFilters && (
            <Button
              variant="link"
              size="sm"
              onClick={clearFilters}
              className="mt-3 h-auto px-0 text-primary"
            >
              Clear all filters
            </Button>
          )}
        </div>
      )}

      {manga.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center sm:mt-10 sm:py-16">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
            <Search className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {hasActiveFilters
              ? "No manga matches those filters"
              : "Your library is empty"}
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try a different search or clear the filters to see everything again."
              : "Add a manga from Discover, or scan a storage folder in Settings → Storage."}
          </p>
          {hasActiveFilters ? (
            <Button className="mt-5" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : (
            <Button
              className="mt-5"
              variant="brand"
              onClick={() => setShowAddManga(true)}
            >
              <Plus className="size-4" /> Add Manga
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:mt-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {manga.map((m) => {
            const cover = api.getAssetUrl(m.coverImage);
            return (
              <div
                key={m.id}
                className="group relative cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => onMangaSelect(m.id)}
                role="button"
                tabIndex={0}
                aria-label={`Open ${m.title}`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onMangaSelect(m.id);
                  }
                }}
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-secondary shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-black/20">
                  {cover ? (
                    <img
                      src={cover}
                      alt={m.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-gradient-to-br from-indigo-500/25 to-secondary text-3xl font-bold text-muted-foreground">
                      {m.title.charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent opacity-80" />
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    onClick={(e) => handleDeleteManga(m.id, m.title, e)}
                    disabled={deleteManga.isPending}
                    title="Remove from library"
                    aria-label={`Remove ${m.title} from library`}
                    className="absolute right-1.5 top-1.5 z-10 bg-black/50 text-white opacity-100 backdrop-blur hover:bg-red-500 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  {m.progress && m.progress.percentComplete > 0 && (
                    <div className="absolute inset-x-0 bottom-0 p-1.5">
                      <Progress
                        value={m.progress.percentComplete}
                        className="h-1 bg-white/20"
                        indicatorClassName="bg-indigo-400"
                      />
                    </div>
                  )}
                </div>
                <div className="mt-2 px-0.5">
                  <h3
                    className="line-clamp-2 text-sm font-medium leading-snug"
                    title={m.title}
                  >
                    {m.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {m.chapterCount || 0} chapters
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddManga && (
        <AddMangaModal
          onClose={() => setShowAddManga(false)}
          onSuccess={() => setShowAddManga(false)}
          onViewManga={onMangaSelect}
        />
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
