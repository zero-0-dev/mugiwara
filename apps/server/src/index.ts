import express from 'express';
import cors from 'cors';
import { join } from 'path';

import { initDatabase, closeDatabase } from './database';
import { pluginManager, LocalFileSource } from './plugins';
import { getLibraryDirectories } from './services/settings';

import mangaRoutes from './api/manga';
import chapterRoutes from './api/chapters';
import libraryRoutes from './api/library';
import contentRoutes from './api/content';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/manga', mangaRoutes);
app.use('/api/manga/:mangaId/chapters', chapterRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/content', contentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize server
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    // Initialize database
    initDatabase();
    
    // Register local file source
    const localSource = new LocalFileSource();
    pluginManager.registerSource(localSource);

    // Load configured directories from settings
    const savedDirectories = await getLibraryDirectories();
    if (savedDirectories.length > 0) {
      localSource.setDirectories(savedDirectories);
      console.log(`📚 Loaded ${savedDirectories.length} library directories from settings`);
    }
    
    // Start server
    server = app.listen(PORT, () => {
      console.log(`🚀 Mugiwara server running on http://localhost:${PORT}`);
      console.log(`📁 Data directory: ${process.env.DATA_DIR || join(process.cwd(), 'data')}`);
      
      // Notify parent process (Electron) that we're ready
      if (process.send) {
        process.send('ready');
      }
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('\n👋 Shutting down gracefully...');
      closeDatabase();
      if (server) {
        server.close(() => {
          console.log('Server closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Handle messages from parent process (Electron)
    process.on('message', (msg) => {
      if (msg === 'shutdown') {
        shutdown();
      }
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
