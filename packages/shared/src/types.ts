export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
export type MediaType = 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'unknown';
export type ReadingStatus = 'reading' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_read';
export type ArchiveType = 'cbz' | 'cbr' | 'zip' | 'folder';

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
  sourceId: string;
  sourceMangaId?: string;
  chapters?: Chapter[];
  categories?: Category[];
  progress?: ReadingProgress;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  mangaId: string;
  chapterNumber: number;
  title?: string;
  pagesCount: number;
  filePath: string;
  archiveType: ArchiveType;
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
  trackerType: 'myanimelist' | 'anilist' | 'kitsu';
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
  sortBy: 'title' | 'lastRead' | 'dateAdded' | 'progress';
  sortOrder: 'asc' | 'desc';
}

export interface PageInfo {
  index: number;
  url: string;
  width?: number;
  height?: number;
}
