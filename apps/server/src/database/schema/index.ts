import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const manga = sqliteTable('manga', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  altTitles: text('alt_titles', { mode: 'json' }).$type<string[]>(),
  description: text('description'),
  author: text('author'),
  artist: text('artist'),
  status: text('status').notNull().default('unknown'),
  mediaType: text('media_type').notNull().default('unknown'),
  coverImage: text('cover_image'),
  bannerImage: text('banner_image'),
  sourceId: text('source_id').notNull(),
  sourceMangaId: text('source_manga_id'),
  anilistId: integer('anilist_id'),
  genres: text('genres', { mode: 'json' }).$type<string[]>(),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  lastMetadataSync: text('last_metadata_sync'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const mangaRelations = relations(manga, ({ many }) => ({
  chapters: many(chapters),
  progress: many(readingProgress),
  categories: many(mangaCategories),
  collections: many(mangaCollections),
  tracking: many(tracking),
}));

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(),
  mangaId: text('manga_id').notNull().references(() => manga.id, { onDelete: 'cascade' }),
  chapterNumber: real('chapter_number'),
  title: text('title'),
  pagesCount: integer('pages_count').notNull().default(0),
  filePath: text('file_path').notNull(),
  archiveType: text('archive_type').notNull().default('folder'),
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  manga: one(manga, {
    fields: [chapters.mangaId],
    references: [manga.id],
  }),
  progress: many(readingProgress),
}));

export const readingProgress = sqliteTable('reading_progress', {
  id: text('id').primaryKey(),
  mangaId: text('manga_id').notNull().references(() => manga.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
  pageNumber: integer('page_number').notNull().default(1),
  totalPages: integer('total_pages').notNull().default(0),
  percentComplete: real('percent_complete').notNull().default(0),
  isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
  lastReadAt: text('last_read_at').notNull().default('CURRENT_TIMESTAMP'),
  deviceId: text('device_id'),
});

export const readingProgressRelations = relations(readingProgress, ({ one }) => ({
  manga: one(manga, {
    fields: [readingProgress.mangaId],
    references: [manga.id],
  }),
  chapter: one(chapters, {
    fields: [readingProgress.chapterId],
    references: [chapters.id],
  }),
}));

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  manga: many(mangaCategories),
}));

export const mangaCategories = sqliteTable('manga_categories', {
  mangaId: text('manga_id').notNull().references(() => manga.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.mangaId, table.categoryId] }),
}));

export const mangaCategoriesRelations = relations(mangaCategories, ({ one }) => ({
  manga: one(manga, {
    fields: [mangaCategories.mangaId],
    references: [manga.id],
  }),
  category: one(categories, {
    fields: [mangaCategories.categoryId],
    references: [categories.id],
  }),
}));

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const collectionsRelations = relations(collections, ({ many }) => ({
  manga: many(mangaCollections),
}));

export const mangaCollections = sqliteTable('manga_collections', {
  mangaId: text('manga_id').notNull().references(() => manga.id, { onDelete: 'cascade' }),
  collectionId: text('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  addedAt: text('added_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  pk: primaryKey({ columns: [table.mangaId, table.collectionId] }),
}));

export const mangaCollectionsRelations = relations(mangaCollections, ({ one }) => ({
  manga: one(manga, {
    fields: [mangaCollections.mangaId],
    references: [manga.id],
  }),
  collection: one(collections, {
    fields: [mangaCollections.collectionId],
    references: [collections.id],
  }),
}));

export const tracking = sqliteTable('tracking', {
  id: text('id').primaryKey(),
  mangaId: text('manga_id').notNull().references(() => manga.id, { onDelete: 'cascade' }),
  trackerType: text('tracker_type').notNull(),
  trackerMangaId: text('tracker_manga_id').notNull(),
  status: text('status').notNull().default('plan_to_read'),
  score: integer('score'),
  chaptersRead: integer('chapters_read').notNull().default(0),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
});

export const trackingRelations = relations(tracking, ({ one }) => ({
  manga: one(manga, {
    fields: [tracking.mangaId],
    references: [manga.id],
  }),
}));

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});
