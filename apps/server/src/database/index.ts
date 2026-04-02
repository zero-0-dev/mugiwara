import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'mugiwara.db');
console.log(`📂 Using database at: ${DB_PATH}`);

// Create database connection
const sqlite = new Database(DB_PATH);

// Enable WAL mode for better performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export schema for use in other modules
export * from './schema';
export * from './repositories';

// Initialize database with default data
export async function initDatabase(): Promise<void> {
  // Create tables if they don't exist
  // Drizzle will handle this through migrations, but for now we'll use the existing schema
  
  // Insert default categories
  const defaultCategories = [
    { name: 'Reading', color: '#22c55e' },
    { name: 'Completed', color: '#3b82f6' },
    { name: 'On Hold', color: '#f59e0b' },
    { name: 'Dropped', color: '#ef4444' },
    { name: 'Plan to Read', color: '#6b7280' },
  ];

  for (const cat of defaultCategories) {
    // Check if category exists
    const existing = await db.query.categories.findFirst({
      where: eq(schema.categories.name, cat.name)
    });
    
    if (!existing) {
      await db.insert(schema.categories).values({
        id: crypto.randomUUID(),
        name: cat.name,
        color: cat.color,
        sortOrder: defaultCategories.indexOf(cat),
      });
    }
  }

  console.log('✅ Database initialized successfully');
}

export function closeDatabase(): void {
  sqlite.close();
}
