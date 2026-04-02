import type { Manga, Chapter, PageInfo } from '@mugiwara/types';

export interface MangaSource {
  id: string;
  name: string;
  version: string;
  
  // Search for manga by query
  search(query: string, page?: number): Promise<Manga[]>;
  
  // Get manga details including chapters
  getMangaDetails(mangaId: string): Promise<Manga | null>;
  
  // Get chapter pages
  getChapterPages(mangaId: string, chapterId: string): Promise<PageInfo[]>;
  
  // Check for new chapters (optional)
  checkForUpdates?(mangaId: string, lastChapterNumber: number): Promise<Chapter[]>;
}

export interface LocalFileConfig {
  directories: string[];
  supportedFormats: string[];
  scanInterval?: number; // in minutes
}

export abstract class BaseMangaSource implements MangaSource {
  abstract id: string;
  abstract name: string;
  abstract version: string;
  
  abstract search(query: string, page?: number): Promise<Manga[]>;
  abstract getMangaDetails(mangaId: string): Promise<Manga | null>;
  abstract getChapterPages(mangaId: string, chapterId: string): Promise<PageInfo[]>;
  
  async checkForUpdates?(mangaId: string, lastChapterNumber: number): Promise<Chapter[]> {
    return [];
  }
}
