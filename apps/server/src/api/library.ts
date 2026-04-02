import { Router, Request, Response } from 'express';
import { mangaRepository, chapterRepository } from '../database';
import { pluginManager, LocalFileSource } from '../plugins';
import { v4 as uuidv4 } from 'uuid';
import type { Manga, Chapter } from '@mugiwara/types';
import { getLibraryDirectories, setLibraryDirectories } from '../services/settings';

const router: Router = Router();

interface ScannedChapter {
  id: string;
  path: string;
  chapterNumber: number;
  title?: string;
  archiveType: 'cbz' | 'cbr' | 'zip' | 'folder';
}

interface ScannedManga {
  id: string;
  path: string;
  title: string;
  sourceMangaId: string;
  chapters: ScannedChapter[];
}

// POST /api/library/scan - Scan all configured sources
router.post('/scan', async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = {
      added: 0,
      updated: 0,
      errors: [] as string[],
    };
    
    for (const source of pluginManager.getAllSources()) {
      try {
        if (source.id === 'local') {
          const localSource = source as LocalFileSource;
          const scanned = await localSource.scanAllDirectories() as ScannedManga[];
          
          for (const scannedManga of scanned) {
            try {
              // Check if manga exists
              const existing = await mangaRepository.findBySource('local', scannedManga.sourceMangaId);
              
              if (existing) {
                // Update existing manga chapters
                const existingChapters = await chapterRepository.findByMangaId(existing.id);
                const existingPaths = new Set(existingChapters.map((c: any) => c.filePath));
                const existingNumbers = new Set(existingChapters.map((c: any) => c.chapterNumber));
                
                for (const chapter of scannedManga.chapters) {
                  // Skip if chapter path already exists or chapter number already exists
                  if (!existingPaths.has(chapter.path) && !existingNumbers.has(chapter.chapterNumber)) {
                    try {
                      await chapterRepository.create({
                        id: uuidv4(),
                        mangaId: existing.id,
                        chapterNumber: chapter.chapterNumber,
                        title: chapter.title,
                        pagesCount: 0,
                        filePath: chapter.path,
                        archiveType: chapter.archiveType,
                      });
                      results.updated++;
                    } catch (err) {
                      // Silently skip duplicates due to UNIQUE constraint
                      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
                        console.log(`Skipping duplicate chapter: ${chapter.title}`);
                      } else {
                        throw err;
                      }
                    }
                  }
                }
              } else {
                // Create new manga
                const newManga = await mangaRepository.create({
                  id: uuidv4(),
                  title: scannedManga.title,
                  sourceId: 'local',
                  sourceMangaId: scannedManga.sourceMangaId,
                  status: 'ongoing',
                  mediaType: 'manga',
                });

                if (!newManga) {
                  throw new Error('Failed to create manga');
                }

                // Create chapters
                for (const chapter of scannedManga.chapters) {
                  await chapterRepository.create({
                    id: uuidv4(),
                    mangaId: newManga.id,
                    chapterNumber: chapter.chapterNumber,
                    title: chapter.title,
                    pagesCount: 0,
                    filePath: chapter.path,
                    archiveType: chapter.archiveType,
                  });
                }

                results.added++;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              results.errors.push(`Failed to process ${scannedManga.title}: ${message}`);
            }
          }
        } else {
          // Handle other source types
          const manga = await source.search('');
          console.log(`Scanned ${manga.length} items from ${source.name}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Failed to scan source ${source.name}: ${message}`);
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error scanning library:', error);
    res.status(500).json({ error: 'Failed to scan library' });
  }
});

// POST /api/library/sources/local/configure - Configure local source
router.post('/sources/local/configure', async (req: Request, res: Response): Promise<void> => {
  try {
    const { directories } = req.body;
    
    if (!Array.isArray(directories)) {
      res.status(400).json({ error: 'directories must be an array' });
      return;
    }
    
    // Save to settings file
    await setLibraryDirectories(directories);
    
    const localSource = pluginManager.getSource('local') as LocalFileSource;
    if (localSource) {
      localSource.setDirectories(directories);
    }
    
    res.json({ success: true, directories });
  } catch (error) {
    console.error('Error configuring local source:', error);
    res.status(500).json({ error: 'Failed to configure local source' });
  }
});

// GET /api/library/sources/local/configure - Get configured directories
router.get('/sources/local/configure', async (_req: Request, res: Response): Promise<void> => {
  try {
    const directories = await getLibraryDirectories();
    res.json({ directories });
  } catch (error) {
    console.error('Error loading local source config:', error);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

// GET /api/library/search - Search manga
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter q is required' });
      return;
    }
    
    const results = await mangaRepository.search(q);
    res.json(results);
  } catch (error) {
    console.error('Error searching manga:', error);
    res.status(500).json({ error: 'Failed to search manga' });
  }
});

export default router;
