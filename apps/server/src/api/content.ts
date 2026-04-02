import { Router, Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import * as yauzl from 'yauzl';
import { join } from 'path';

const router: Router = Router();

// GET /api/content/local/chapter - Serve chapter page
router.get('/local/chapter', async (req: Request, res: Response): Promise<void> => {
  try {
    const { path, archive, file } = req.query;
    
    if (path && typeof path === 'string') {
      // Direct file access
      if (!existsSync(path)) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      
      const imageBuffer = await readFile(path);
      const ext = path.split('.').pop()?.toLowerCase();
      const contentType = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      }[ext || ''] || 'application/octet-stream';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(imageBuffer);
    } else if (archive && file && typeof archive === 'string' && typeof file === 'string') {
      // Archive file access
      if (!existsSync(archive)) {
        res.status(404).json({ error: 'Archive not found' });
        return;
      }
      
      const imageBuffer = await extractFromArchive(archive, file);
      if (!imageBuffer) {
        res.status(404).json({ error: 'File not found in archive' });
        return;
      }
      
      const ext = file.split('.').pop()?.toLowerCase();
      const contentType = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      }[ext || ''] || 'application/octet-stream';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(imageBuffer);
    } else {
      res.status(400).json({ error: 'Invalid parameters' });
    }
  } catch (error) {
    console.error('Error serving content:', error);
    res.status(500).json({ error: 'Failed to serve content' });
  }
});

// GET /api/thumbnails/:filename - Serve thumbnail
router.get('/thumbnails/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;
    if (!filename) {
      res.status(400).json({ error: 'Filename is required' });
      return;
    }
    const thumbnailsDir = join(process.cwd(), 'data', 'thumbnails');
    const filepath = join(thumbnailsDir, filename);
    
    if (!existsSync(filepath)) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }
    
    const imageBuffer = await readFile(filepath);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(imageBuffer);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

function extractFromArchive(archivePath: string, fileName: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }
      
      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName === fileName) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }
            
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', () => {
              zipfile.close();
              resolve(Buffer.concat(chunks));
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      
      zipfile.on('end', () => {
        resolve(null);
      });
      
      zipfile.on('error', reject);
    });
  });
}

export default router;
