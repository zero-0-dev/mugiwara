import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// Storage backends table
export const storageBackends = sqliteTable("storage_backends", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'local', 's3', 'ftp', etc.
  config: text("config").notNull(), // JSON configuration
  isDefault: integer("is_default", { mode: "boolean" }).default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const storageBackendsRelations = relations(
  storageBackends,
  ({ many }) => ({
    manga: many(manga),
  }),
);

// Installed plugins table
export const installedPlugins = sqliteTable("installed_plugins", {
  id: text("id").primaryKey(), // npm package name
  type: text("type").notNull(), // 'source' | 'storage'
  version: text("version").notNull(),
  isBuiltin: integer("is_builtin", { mode: "boolean" }).default(false),
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
  config: text("config", { mode: "json" }).notNull().default("{}"), // JSON configuration
  installedAt: text("installed_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// Import tasks table for background processing
export const importTasks = sqliteTable("import_tasks", {
  id: text("id").primaryKey().default(`lower(hex(randomblob(16)))`),
  type: text("type").notNull().default("chapter"), // 'chapter', 'full_manga'
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'paused', 'complete', 'error'
  priority: integer("priority").default(0),

  mangaId: text("manga_id").references(() => manga.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id"), // String chapter identifier
  sortOrder: integer("sort_order").notNull().default(0), // For queue ordering

  sourceId: text("source_id").notNull(),
  sourceChapterId: text("source_chapter_id"), // For resuming downloads

  totalPages: integer("total_pages"),
  completedPages: integer("completed_pages").default(0),
  progressPercent: integer("progress_percent").default(0),

  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

export const importTasksRelations = relations(importTasks, ({ one }) => ({
  manga: one(manga, {
    fields: [importTasks.mangaId],
    references: [manga.id],
  }),
}));

export const manga = sqliteTable("manga", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  altTitles: text("alt_titles", { mode: "json" }).$type<string[]>(),
  description: text("description"),
  author: text("author"),
  artist: text("artist"),
  status: text("status").notNull().default("unknown"),
  mediaType: text("media_type").notNull().default("unknown"),
  coverImage: text("cover_image"),
  bannerImage: text("banner_image"),
  sourceId: text("source_id").notNull(),
  sourceMangaId: text("source_manga_id"), // ID in the source system
  storageBackendId: text("storage_backend_id").references(
    () => storageBackends.id,
  ),
  anilistId: integer("anilist_id"),
  genres: text("genres", { mode: "json" }).$type<string[]>(),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  lastMetadataSync: text("last_metadata_sync"),
  lastSourceCheck: text("last_source_check"), // Last time we checked for updates
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const mangaRelations = relations(manga, ({ one, many }) => ({
  storageBackend: one(storageBackends, {
    fields: [manga.storageBackendId],
    references: [storageBackends.id],
  }),
  chapters: many(chapters),
  progress: many(readingProgress),
  categories: many(mangaCategories),
  collections: many(mangaCollections),
  tracking: many(tracking),
  importTasks: many(importTasks),
}));

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey().default(`lower(hex(randomblob(16)))`),
    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id").notNull(), // String chapter identifier (e.g., "1", "24-Bis", "bonus")
    title: text("title"),
    pagesCount: integer("pages_count").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0), // For ordering chapters
    importStatus: text("import_status").default("pending"), // 'pending', 'downloading', 'complete', 'error'
    importProgress: integer("import_progress").default(0), // percentage
    publishedAt: text("published_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => ({
    // Unique constraint on manga + chapter_id
    uniqueChapter: uniqueIndex("unique_chapter_idx").on(
      table.mangaId,
      table.chapterId,
    ),
  }),
);

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  manga: one(manga, {
    fields: [chapters.mangaId],
    references: [manga.id],
  }),
  progress: many(readingProgress),
}));

export const readingProgress = sqliteTable("reading_progress", {
  id: text("id").primaryKey(),
  mangaId: text("manga_id")
    .notNull()
    .references(() => manga.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").references(() => chapters.id, {
    onDelete: "set null",
  }),
  pageNumber: integer("page_number").notNull().default(1),
  totalPages: integer("total_pages").notNull().default(0),
  // percentComplete and isCompleted are now calculated dynamically
  // percentComplete = (pageNumber / totalPages) * 100
  // isCompleted = pageNumber >= totalPages
  lastReadAt: text("last_read_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  deviceId: text("device_id"),
});

export const readingProgressRelations = relations(
  readingProgress,
  ({ one }) => ({
    manga: one(manga, {
      fields: [readingProgress.mangaId],
      references: [manga.id],
    }),
    chapter: one(chapters, {
      fields: [readingProgress.chapterId],
      references: [chapters.id],
    }),
  }),
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  manga: many(mangaCategories),
}));

export const mangaCategories = sqliteTable(
  "manga_categories",
  {
    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.mangaId, table.categoryId] }),
  }),
);

export const mangaCategoriesRelations = relations(
  mangaCategories,
  ({ one }) => ({
    manga: one(manga, {
      fields: [mangaCategories.mangaId],
      references: [manga.id],
    }),
    category: one(categories, {
      fields: [mangaCategories.categoryId],
      references: [categories.id],
    }),
  }),
);

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  coverImage: text("cover_image"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const collectionsRelations = relations(collections, ({ many }) => ({
  manga: many(mangaCollections),
}));

export const mangaCollections = sqliteTable(
  "manga_collections",
  {
    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.mangaId, table.collectionId] }),
  }),
);

export const mangaCollectionsRelations = relations(
  mangaCollections,
  ({ one }) => ({
    manga: one(manga, {
      fields: [mangaCollections.mangaId],
      references: [manga.id],
    }),
    collection: one(collections, {
      fields: [mangaCollections.collectionId],
      references: [collections.id],
    }),
  }),
);

export const tracking = sqliteTable("tracking", {
  id: text("id").primaryKey(),
  mangaId: text("manga_id")
    .notNull()
    .references(() => manga.id, { onDelete: "cascade" }),
  trackerType: text("tracker_type").notNull(),
  trackerMangaId: text("tracker_manga_id").notNull(),
  status: text("status").notNull().default("plan_to_read"),
  score: integer("score"),
  chaptersRead: integer("chapters_read").notNull().default(0),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  lastSyncedAt: text("last_synced_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const trackingRelations = relations(tracking, ({ one }) => ({
  manga: one(manga, {
    fields: [tracking.mangaId],
    references: [manga.id],
  }),
}));

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
