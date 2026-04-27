export interface Manga {
  id: string;
  title: string;
  altTitles?: string[];
  description?: string;
  author?: string;
  artist?: string;
  status: "unknown" | "ongoing" | "completed" | "hiatus" | "cancelled";
  mediaType: "unknown" | "manga" | "manhwa" | "manhua" | "webtoon";
  coverImage?: string;
  bannerImage?: string;
  sourceId: string;
  sourceMangaId?: string;
  storageBackendId?: string;
  anilistId?: number;
  genres?: string[];
  tags?: string[];
  lastMetadataSync?: string;
  createdAt: string;
  updatedAt: string;
  progress?: ReadingProgress;
  chapterCount?: number;
}

export interface Chapter {
  id: string;
  mangaId: string;
  chapterId: string;
  title?: string;
  pagesCount: number;
  sortOrder: number;
  importStatus: "pending" | "downloading" | "complete" | "error" | "cancelled";
  importProgress: number;
  publishedAt?: string;
  createdAt: string;
}

export interface ReadingProgress {
  id: string;
  mangaId: string;
  chapterId?: string;
  pageNumber: number;
  totalPages: number;
  percentComplete: number;
  isCompleted: boolean;
  lastReadAt: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
}

export interface Source {
  id: string;
  name: string;
  description: string;
}

export interface SearchResult {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  description?: string;
  author?: string;
  artist?: string;
}

export interface ImportTask {
  id: string;
  type: "chapter" | "full_manga";
  status: "pending" | "running" | "paused" | "complete" | "error";
  mangaId: string;
  chapterId?: string;
  progressPercent: number;
  errorMessage?: string;
}

export interface QueueStats {
  pending: number;
  running: number;
  paused: number;
  complete: number;
  error: number;
  total: number;
}

export interface PageInfo {
  index: number;
  url: string;
  width?: number;
  height?: number;
}

export type ReadingMode = "rtl" | "ltr" | "vertical";

export interface SourceMangaChapter {
  sourceChapterId: string;
  chapterId: string;
  title?: string;
  sortOrder: number;
  language?: string;
  scanlationGroup?: string;
}

export interface SourceMangaDetails {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  chapters: SourceMangaChapter[];
}

export interface ImportChapterProgress {
  chapterId: string;
  title?: string;
  sortOrder: number;
  status: "queued" | "downloading" | "complete" | "error";
  totalPages?: number;
  completedPages?: number;
  errorMessage?: string;
}

export interface DiscoverManga {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  description: string | null;
  coverImage: {
    large: string;
    medium: string;
  } | null;
  bannerImage: string | null;
  author: string | null;
  artist: string | null;
  status: string;
  genres: string[];
  mediaType: string;
  tags: { name: string }[];
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  chapters: number | null;
  volumes: number | null;
  synonyms: string[];
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  favourites?: number;
}

export interface DiscoverBrowseResult {
  manga: DiscoverManga[];
  pageInfo: {
    currentPage: number;
    hasNextPage: boolean;
    total: number;
  };
}

export interface DiscoverFilters {
  sort?: string[];
  genre?: string;
  format?: string;
  status?: string;
  country?: string;
  search?: string;
  page?: number;
  perPage?: number;
}

export interface ImportProgressResponse {
  mangaId: string;
  totalChapters: number;
  completedChapters: number;
  erroredChapters: number;
  downloadingChapters: number;
  queuedChapters: number;
  overallProgress: number;
  isComplete: boolean;
  chapters: ImportChapterProgress[];
}
