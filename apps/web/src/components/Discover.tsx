import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useDiscoverBrowse } from "../api/hooks";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";

interface AniListManga {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: { large: string; medium: string } | null;
  genres: string[];
  mediaType: string;
  status: string;
  averageScore?: number;
  chapters: number | null;
  startDate: { year: number | null; month: number | null; day: number | null };
}

const CATEGORIES = [
  { label: "Trending", sort: "TRENDING_DESC" },
  { label: "Popular", sort: "POPULARITY_DESC" },
  { label: "Top Rated", sort: "SCORE_DESC" },
  { label: "Favorites", sort: "FAVOURITES_DESC" },
  { label: "Newest", sort: "START_DATE_DESC" },
  { label: "Recently Updated", sort: "UPDATED_AT_DESC" },
  { label: "Popular Manhwa", sort: "POPULARITY_DESC", country: "KR" },
  { label: "Popular Manhua", sort: "POPULARITY_DESC", country: "CN" },
];

const GENRES = [
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
];

interface DiscoverProps {
  onMangaSelect: (anilistId: number) => void;
}

export function Discover({ onMangaSelect }: DiscoverProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]!);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const categoryRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const filters = {
    sort: activeCategory.sort,
    country: activeCategory.country,
    search: submittedQuery || undefined,
    genre: selectedGenre || undefined,
    perPage: 30,
  };

  const {
    data,
    isLoading,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDiscoverBrowse(filters);

  const allManga = useMemo(
    () => data?.pages.flatMap((p) => p.manga) ?? [],
    [data],
  );

  function handleSearch() {
    setSubmittedQuery(searchQuery.trim());
  }

  useEffect(() => {
    categoryRefs.current[activeCategory.label]?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [activeCategory.label]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:py-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-3xl">
            <Compass className="size-5 shrink-0 text-brand-text sm:size-6" />
            Discover
          </h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Find your next series on AniList, then add it from a source.
          </p>
        </div>
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="icon"
          className="shrink-0 sm:hidden"
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-label="Filters"
          title="Filters"
        >
          <SlidersHorizontal className="size-5" />
        </Button>
      </div>

      <div className="mt-3 flex gap-2 sm:mt-5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search manga..."
            aria-label="Search manga"
            className="h-10 pl-9"
          />
        </div>
        <Button variant="brand" onClick={handleSearch} className="h-10">
          Search
        </Button>
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mt-4 sm:px-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.label}
            ref={(element) => {
              categoryRefs.current[cat.label] = element;
            }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              activeCategory.label === cat.label
                ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                : "border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-pressed={activeCategory.label === cat.label}
            onClick={() => {
              setActiveCategory(cat);
              setSelectedGenre("");
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <button
        className="mt-3 hidden items-center gap-1 text-sm font-medium text-brand-text outline-none hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
        onClick={() => setShowFilters(!showFilters)}
        aria-expanded={showFilters}
      >
        {showFilters ? (
          <>
            Hide Filters <ChevronUp className="size-4" />
          </>
        ) : (
          <>
            Filters <ChevronDown className="size-4" />
          </>
        )}
      </button>

      {showFilters && (
        <div className="mt-3 rounded-2xl border border-border/80 bg-card/70 p-3 sm:p-4">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Genre
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                !selectedGenre
                  ? "border-primary/40 bg-primary/15 text-brand-text"
                  : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              onClick={() => setSelectedGenre("")}
            >
              Any
            </button>
            {GENRES.map((genre) => (
              <button
                key={genre}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedGenre === genre
                    ? "border-primary/40 bg-primary/15 text-brand-text"
                    : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                onClick={() => setSelectedGenre(genre)}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 18 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && !isFetching && allManga.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <Compass className="size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No manga found</p>
        </div>
      ) : null}

      {!isLoading && allManga.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {allManga.map((m: AniListManga) => (
            <div
              key={m.id}
              className="group cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => onMangaSelect(m.id)}
              role="button"
              tabIndex={0}
              aria-label={`Open ${m.title.english || m.title.romaji}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onMangaSelect(m.id);
                }
              }}
            >
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/70 bg-secondary shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg group-hover:shadow-black/20">
                {m.coverImage?.large ? (
                  <img
                    src={m.coverImage.large}
                    alt={m.title.english || m.title.romaji}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-indigo-500/25 to-secondary text-3xl font-bold text-muted-foreground">
                    {(m.title.english || m.title.romaji)
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                {m.averageScore && (
                  <Badge className="absolute right-1.5 top-1.5 bg-black/60 text-white backdrop-blur">
                    {m.averageScore}%
                  </Badge>
                )}
              </div>
              <div className="mt-2 px-0.5">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug">
                  {m.title.english || m.title.romaji}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.mediaType.toUpperCase()}
                  {m.chapters ? ` · ${m.chapters} ch` : ""}
                </p>
              </div>
            </div>
          ))}

          {isFetchingNextPage && (
            <div className="col-span-full flex items-center justify-center gap-3 py-6 text-sm text-muted-foreground">
              <div className="loading-spinner size-6" />
              Loading more...
            </div>
          )}
          {!isFetchingNextPage && hasNextPage && (
            <div className="col-span-full flex justify-center py-6">
              <Button variant="outline" onClick={() => fetchNextPage()}>
                Load More
              </Button>
            </div>
          )}
          {!isFetchingNextPage && !hasNextPage && allManga.length > 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
              All results loaded
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
