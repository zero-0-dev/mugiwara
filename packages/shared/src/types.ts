export type MangaStatus = "ongoing" | "completed" | "hiatus" | "cancelled";
export type MediaType = "manga" | "manhwa" | "manhua" | "webtoon" | "unknown";
export type ReadingStatus =
  | "reading"
  | "completed"
  | "on_hold"
  | "dropped"
  | "plan_to_read";

// Chapter ID is now a string to support formats like "1", "24-Bis", "bonus", etc.
export type ChapterId = string;

// Import task status
export type ImportTaskStatus =
  | "pending"
  | "running"
  | "paused"
  | "complete"
  | "error";

export interface Manga {
  id: string;
  title: string;
  altTitles?: string[];
  description?: string;
  author?: string;
  artist?: string;
  status: MangaStatus;
  mediaType: MediaType;
  coverImage?: string;
  bannerImage?: string;
  // Source information
  sourceId: string;
  sourceMangaId?: string;
  // Storage backend reference
  storageBackendId?: string;
  // Related data
  chapters?: Chapter[];
  categories?: Category[];
  progress?: ReadingProgress;
  genres?: string[];
  tags?: string[];
  // Metadata
  anilistId?: number;
  lastMetadataSync?: string;
  lastSourceCheck?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  mangaId: string;
  // chapterId is now a string (was chapterNumber: number)
  // Examples: "1", "2", "24-Bis", "25-Special", "bonus", "extra"
  chapterId: ChapterId;
  title?: string;
  pagesCount: number;
  // Sort order for displaying chapters in correct sequence
  sortOrder: number;
  // Import status for tracking background downloads
  importStatus?: "pending" | "downloading" | "complete" | "error" | "cancelled";
  importProgress?: number; // percentage
  publishedAt?: string;
  createdAt: string;
}

export interface ReadingProgress {
  id: string;
  mangaId: string;
  chapterId: string;
  pageNumber: number;
  totalPages: number;
  percentComplete: number;
  isCompleted: boolean;
  lastReadAt: string;
  deviceId?: string;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  sortOrder: number;
  mangaCount: number;
  createdAt: string;
}

export interface TrackingInfo {
  id: string;
  mangaId: string;
  trackerType: "myanimelist" | "anilist" | "kitsu";
  trackerMangaId: string;
  status: ReadingStatus;
  score?: number;
  chaptersRead: number;
  startedAt?: string;
  finishedAt?: string;
  lastSyncedAt: string;
}

export interface LibraryFilter {
  status?: ReadingStatus;
  mediaType?: MediaType;
  categoryId?: string;
  search?: string;
  sortBy: "title" | "lastRead" | "dateAdded" | "progress";
  sortOrder: "asc" | "desc";
}

export interface PageInfo {
  index: number;
  url: string;
  width?: number;
  height?: number;
}

// New: Storage Backend Types
export interface StorageBackend {
  id: string;
  name: string;
  type: "local" | "s3" | "ftp" | "webdav";
  config: Record<string, any>;
  isDefault: boolean;
  createdAt: string;
}

// New: Plugin Types
export interface InstalledPlugin {
  id: string; // npm package name
  type: "source" | "storage";
  version: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  config: Record<string, any>;
  installedAt: string;
  updatedAt: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
}

// New: Import Queue Types
export interface ImportTask {
  id: string;
  type: "chapter" | "full_manga";
  status: ImportTaskStatus;
  priority: number;

  mangaId: string;
  chapterId?: string;
  sortOrder: number;

  sourceId: string;
  sourceChapterId?: string;

  totalPages?: number;
  completedPages: number;
  progressPercent: number;

  errorMessage?: string;
  retryCount: number;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface QueueStats {
  pending: number;
  running: number;
  paused: number;
  complete: number;
  error: number;
  total: number;
}

// Helper type for chapter sorting
export interface ChapterSortInfo {
  chapterId: string;
  sortOrder: number;
  title?: string;
}
