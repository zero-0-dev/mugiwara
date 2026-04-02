import { BaseMangaSource } from '../types';
import type { Manga, Chapter, PageInfo, MediaType, ArchiveType } from '@mugiwara/types';
import { v4 as uuidv4 } from 'uuid';
import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, basename, relative } from 'path';
import { existsSync } from 'fs';
import * as yauzl from 'yauzl';
import { promisify } from 'util';
import sharp from 'sharp';
import { mkdirSync } from 'fs';

interface ScannedManga {
  id: string;
  path: string;
  title: string;
  sourceMangaId: string;
  chapters: ScannedChapter[];
}

interface ScannedChapter {
  id: string;
  path: string;
  chapterNumber: number;
  title?: string;
  archiveType: ArchiveType;
}

export class LocalFileSource extends BaseMangaSource {
  id = 'local';
  name = 'Local Files';
  version = '1.0.0';
  
  private directories: string[];
  private thumbnailsDir: string;
  
  constructor(directories: string[] = []) {
    super();
    this.directories = directories.filter(d => existsSync(d));
    this.thumbnailsDir = join(process.cwd(), 'data', 'thumbnails');
    mkdirSync(this.thumbnailsDir, { recursive: true });
  }
  
  setDirectories(directories: string[]): void {
    this.directories = directories.filter(d => existsSync(d));
  }
  
  async search(): Promise<Manga[]> {
    // For local files, search returns all scanned manga
    const scanned = await this.scanAllDirectories();
    return scanned.map(s => this.convertToManga(s));
  }
  
  async getMangaDetails(mangaId: string): Promise<Manga | null> {
    // mangaId for local source is the path
    if (!existsSync(mangaId)) {
      return null;
    }
    
    const scanned = await this.scanMangaDirectory(mangaId);
    return this.convertToManga(scanned);
  }
  
  async getChapterPages(mangaId: string, chapterId: string): Promise<PageInfo[]> {
    // chapterId is the chapter path
    const chapterPath = chapterId;
    
    if (!existsSync(chapterPath)) {
      return [];
    }
    
    const statInfo = await stat(chapterPath);
    
    if (statInfo.isDirectory()) {
      return this.getPagesFromFolder(chapterPath);
    } else {
      return this.getPagesFromArchive(chapterPath);
    }
  }
  
  async scanAllDirectories(): Promise<ScannedManga[]> {
    const results: ScannedManga[] = [];
    
    for (const dir of this.directories) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const mangaPath = join(dir, entry.name);
            try {
              const scanned = await this.scanMangaDirectory(mangaPath);
              if (scanned.chapters.length > 0) {
                results.push(scanned);
              }
            } catch (err) {
              console.warn(`Failed to scan ${mangaPath}:`, err);
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to read directory ${dir}:`, err);
      }
    }
    
    return results;
  }
  
  private async scanMangaDirectory(mangaPath: string): Promise<ScannedManga> {
    const title = basename(mangaPath);
    const chapters: ScannedChapter[] = [];
    
    try {
      const entries = await readdir(mangaPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = join(mangaPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if folder contains images
          const chapterNum = this.extractChapterNumber(entry.name);
          if (await this.containsImages(entryPath)) {
            chapters.push({
              id: entryPath,
              path: entryPath,
              chapterNumber: chapterNum,
              title: entry.name,
              archiveType: 'folder',
            });
          }
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (['.cbz', '.cbr', '.zip'].includes(ext)) {
            const chapterNum = this.extractChapterNumber(entry.name);
            const archiveType: ArchiveType = ext === '.cbr' ? 'cbr' : 'cbz';
            chapters.push({
              id: entryPath,
              path: entryPath,
              chapterNumber: chapterNum,
              title: entry.name.replace(ext, ''),
              archiveType,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Error scanning manga directory ${mangaPath}:`, err);
    }
    
    // Sort chapters by number
    chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    
    return { 
      id: mangaPath,
      path: mangaPath, 
      title, 
      sourceMangaId: mangaPath,
      chapters 
    };
  }
  
  private extractChapterNumber(filename: string): number {
    // Try to extract chapter number from filename
    // Patterns: "Chapter 1", "Ch. 1", "Vol.1 Ch.1", "001", etc.
    const patterns = [
      /chapter[\s._-]*(\d+(?:\.\d+)?)/i,
      /ch[\s._-]*(\d+(?:\.\d+)?)/i,
      /c[\s._-]*(\d+(?:\.\d+)?)/i,
      /\b(\d+(?:\.\d+)?)\s*(?:v\d+)?\s*$/,
      /\b(\d{2,3})\b/,
    ];
    
    for (const pattern of patterns) {
      const match = filename.match(pattern);
      if (match && match[1]) {
        return parseFloat(match[1]);
      }
    }
    
    return 0;
  }
  
  private async containsImages(dirPath: string): Promise<boolean> {
    try {
      const files = await readdir(dirPath);
      const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
      return files.some(f => imageExts.includes(extname(f).toLowerCase()));
    } catch {
      return false;
    }
  }
  
  private async getPagesFromFolder(folderPath: string): Promise<PageInfo[]> {
    try {
      const files = await readdir(folderPath);
      const imageFiles = files
        .filter(f => ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(extname(f).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      
      return imageFiles.map((file, index) => ({
        index,
        url: `/api/content/local/chapter?path=${encodeURIComponent(join(folderPath, file))}`,
      }));
    } catch {
      return [];
    }
  }
  
  private async getPagesFromArchive(archivePath: string): Promise<PageInfo[]> {
    return new Promise((resolve, reject) => {
      const pages: PageInfo[] = [];
      
      yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }
        
        const imageFiles: string[] = [];
        
        zipfile.readEntry();
        zipfile.on('entry', (entry: yauzl.Entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory
            zipfile.readEntry();
          } else {
            const ext = extname(entry.fileName).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
              imageFiles.push(entry.fileName);
            }
            zipfile.readEntry();
          }
        });
        
        zipfile.on('end', () => {
          // Sort and create page info
          imageFiles
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .forEach((fileName, index) => {
              pages.push({
                index,
                url: `/api/content/local/chapter?archive=${encodeURIComponent(archivePath)}&file=${encodeURIComponent(fileName)}`,
              });
            });
          resolve(pages);
        });
        
        zipfile.on('error', reject);
      });
    });
  }
  
  private async generateThumbnail(mangaPath: string): Promise<string | undefined> {
    try {
      const entries = await readdir(mangaPath, { withFileTypes: true });
      
      // Find first chapter
      for (const entry of entries) {
        const entryPath = join(mangaPath, entry.name);
        
        if (entry.isDirectory() && await this.containsImages(entryPath)) {
          const files = await readdir(entryPath);
          const imageFiles = files
            .filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(f).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          
          if (imageFiles.length > 0 && imageFiles[0]) {
            const firstImagePath = join(entryPath, imageFiles[0]);
            const thumbnailName = `${Buffer.from(mangaPath).toString('base64url')}.jpg`;
            const thumbnailPath = join(this.thumbnailsDir, thumbnailName);
            
            if (!existsSync(thumbnailPath)) {
              await sharp(firstImagePath)
                .resize(300, 450, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toFile(thumbnailPath);
            }
            
            return `/api/thumbnails/${thumbnailName}`;
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to generate thumbnail for ${mangaPath}:`, err);
    }
    
    return undefined;
  }
  
  private convertToManga(scanned: ScannedManga): Manga {
    const manga: Manga = {
      id: scanned.path,
      title: scanned.title,
      sourceId: this.id,
      sourceMangaId: scanned.path,
      status: 'ongoing',
      mediaType: 'manga',
      coverImage: undefined, // Will be generated on demand
      chapters: scanned.chapters.map(ch => ({
        id: ch.path,
        mangaId: scanned.path,
        chapterNumber: ch.chapterNumber,
        title: ch.title,
        pagesCount: 0,
        filePath: ch.path,
        archiveType: ch.archiveType,
        createdAt: new Date().toISOString(),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    return manga;
  }
}
