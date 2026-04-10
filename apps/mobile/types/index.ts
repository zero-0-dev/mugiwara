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
  importStatus: "pending" | "downloading" | "complete" | "error";
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
}

export type ReadingMode = "rtl" | "ltr" | "vertical";
