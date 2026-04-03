import { Router, Request, Response } from 'express';
import { db, settings } from '../database';
import { eq } from 'drizzle-orm';

const router: Router = Router();

// Default settings
const defaultSettings: Record<string, string> = {
  // Reading preferences
  'reading.defaultMode': 'rtl',
  'reading.mangaMode': 'rtl',
  'reading.manhwaMode': 'vertical',
  'reading.manhuaMode': 'vertical',
  'reading.webtoonMode': 'vertical',
  
  // UI preferences
  'ui.theme': 'dark',
  'ui.showNSFW': 'false',
  
  // Library preferences
  'library.autoScan': 'false',
  'library.autoRefreshMetadata': 'false',
};

// GET /api/settings - Get all settings
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allSettings = await db.query.settings.findMany();
    
    // Merge with defaults
    const result: Record<string, string> = { ...defaultSettings };
    allSettings.forEach(s => {
      result[s.key] = s.value;
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// GET /api/settings/:key - Get specific setting
router.get('/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = req.params.key || '';
    if (!key) {
      res.status(400).json({ error: 'Key is required' });
      return;
    }
    
    const setting = await db.query.settings.findFirst({
      where: eq(settings.key, key)
    });
    
    if (setting) {
      res.json({ key: setting.key, value: setting.value });
    } else if (key in defaultSettings) {
      res.json({ key, value: defaultSettings[key] });
    } else {
      res.status(404).json({ error: 'Setting not found' });
    }
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// PUT /api/settings/:key - Update specific setting
router.put('/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = req.params.key || '';
    const { value } = req.body;
    
    if (!key) {
      res.status(400).json({ error: 'Key is required' });
      return;
    }
    
    if (value === undefined) {
      res.status(400).json({ error: 'Value is required' });
      return;
    }
    
    // Check if setting exists
    const existing = await db.query.settings.findFirst({
      where: eq(settings.key, key)
    });
    
    if (existing) {
      // Update
      await db.update(settings)
        .set({ value: String(value), updatedAt: new Date().toISOString() })
        .where(eq(settings.key, key));
    } else {
      // Insert
      await db.insert(settings).values({
        key,
        value: String(value),
        updatedAt: new Date().toISOString()
      });
    }
    
    res.json({ key, value: String(value) });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// PUT /api/settings - Update multiple settings
router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const updates: Record<string, string> = req.body;
    
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'Settings object is required' });
      return;
    }
    
    const results: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      const existing = await db.query.settings.findFirst({
        where: eq(settings.key, key)
      });
      
      if (existing) {
        await db.update(settings)
          .set({ value: String(value), updatedAt: new Date().toISOString() })
          .where(eq(settings.key, key));
      } else {
        await db.insert(settings).values({
          key,
          value: String(value),
          updatedAt: new Date().toISOString()
        });
      }
      
      results[key] = String(value);
    }
    
    res.json(results);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// DELETE /api/settings/:key - Reset setting to default
router.delete('/:key', async (req: Request, res: Response): Promise<void> => {
  try {
    const key = req.params.key || '';
    if (!key) {
      res.status(400).json({ error: 'Key is required' });
      return;
    }
    
    await db.delete(settings).where(eq(settings.key, key));
    
    // Return default value if exists
    if (key in defaultSettings) {
      res.json({ key, value: defaultSettings[key], reset: true });
    } else {
      res.status(204).send();
    }
  } catch (error) {
    console.error('Error resetting setting:', error);
    res.status(500).json({ error: 'Failed to reset setting' });
  }
});

// GET /api/settings/reading/mode/:mediaType - Get reading mode for media type
router.get('/reading/mode/:mediaType', async (req: Request, res: Response): Promise<void> => {
  try {
    const mediaType = req.params.mediaType || '';
    if (!mediaType) {
      res.status(400).json({ error: 'Media type is required' });
      return;
    }
    
    const key = `reading.${mediaType}Mode`;
    
    const setting = await db.query.settings.findFirst({
      where: eq(settings.key, key)
    });
    
    const value = setting?.value || defaultSettings[key] || defaultSettings['reading.defaultMode'];
    
    res.json({ mediaType, mode: value });
  } catch (error) {
    console.error('Error fetching reading mode:', error);
    res.status(500).json({ error: 'Failed to fetch reading mode' });
  }
});

// GET /api/settings/readingMode/:mangaId - Get per-manga reading mode
router.get('/readingMode/:mangaId', async (req: Request, res: Response): Promise<void> => {
  try {
    const mangaId = req.params.mangaId || '';
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID is required' });
      return;
    }
    
    const key = `readingMode.${mangaId}`;
    
    const setting = await db.query.settings.findFirst({
      where: eq(settings.key, key)
    });
    
    if (setting) {
      res.json({ key: setting.key, value: setting.value });
    } else {
      res.status(404).json({ error: 'Setting not found' });
    }
  } catch (error) {
    console.error('Error fetching manga reading mode:', error);
    res.status(500).json({ error: 'Failed to fetch reading mode' });
  }
});

// PUT /api/settings/readingMode/:mangaId - Set per-manga reading mode
router.put('/readingMode/:mangaId', async (req: Request, res: Response): Promise<void> => {
  try {
    const mangaId = req.params.mangaId || '';
    const { value } = req.body;
    
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID is required' });
      return;
    }
    
    if (!value || !['rtl', 'ltr', 'vertical'].includes(value)) {
      res.status(400).json({ error: 'Valid reading mode (rtl, ltr, vertical) is required' });
      return;
    }
    
    const key = `readingMode.${mangaId}`;
    
    // Check if setting exists
    const existing = await db.query.settings.findFirst({
      where: eq(settings.key, key)
    });
    
    if (existing) {
      // Update
      await db.update(settings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(settings.key, key));
    } else {
      // Insert
      await db.insert(settings).values({
        key,
        value,
        updatedAt: new Date().toISOString()
      });
    }
    
    res.json({ key, value });
  } catch (error) {
    console.error('Error updating manga reading mode:', error);
    res.status(500).json({ error: 'Failed to update reading mode' });
  }
});

// DELETE /api/settings/readingMode/:mangaId - Reset per-manga reading mode
router.delete('/readingMode/:mangaId', async (req: Request, res: Response): Promise<void> => {
  try {
    const mangaId = req.params.mangaId || '';
    if (!mangaId) {
      res.status(400).json({ error: 'Manga ID is required' });
      return;
    }
    
    const key = `readingMode.${mangaId}`;
    
    await db.delete(settings).where(eq(settings.key, key));
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting manga reading mode:', error);
    res.status(500).json({ error: 'Failed to delete reading mode' });
  }
});

export default router;
