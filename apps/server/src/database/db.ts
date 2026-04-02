import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import * as schema from './schema';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'mugiwara.db');

// Create database connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in other modules
export * from './schema';

console.log(`📁 Database connected: ${DB_PATH}`);
