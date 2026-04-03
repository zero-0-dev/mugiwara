import { eq, like, or, and, desc, sql, count } from "drizzle-orm";
import { db, manga, chapters, readingProgress, importTasks } from "../index";

export const mangaRepository = {
  async findAll() {
    return await db.query.manga.findMany({
      orderBy: desc(manga.title),
    });
  },

  async findById(id: string) {
    return await db.query.manga.findFirst({
      where: eq(manga.id, id),
    });
  },

  async findBySource(sourceId: string, sourceMangaId: string) {
    return await db.query.manga.findFirst({
      where: and(
        eq(manga.sourceId, sourceId),
        eq(manga.sourceMangaId, sourceMangaId),
      ),
    });
  },

  async create(data: typeof manga.$inferInsert) {
    const result = await db.insert(manga).values(data).returning();
    return result[0];
  },

  async update(id: string, data: Partial<typeof manga.$inferInsert>) {
    const result = await db
      .update(manga)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(manga.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string) {
    // Delete related records first (in correct order to avoid FK constraint errors)
    // Note: Most tables have onDelete: "cascade", but we explicitly delete for safety

    // Delete import tasks
    await db.delete(importTasks).where(eq(importTasks.mangaId, id));

    // Delete reading progress (has FK to chapters, so delete before chapters)
    await db.delete(readingProgress).where(eq(readingProgress.mangaId, id));

    // Delete chapters (will cascade delete reading progress if any remain)
    await db.delete(chapters).where(eq(chapters.mangaId, id));

    // Finally delete the manga
    // This will cascade delete: mangaCategories, mangaCollections, tracking
    await db.delete(manga).where(eq(manga.id, id));
  },

  async search(query: string) {
    return await db.query.manga.findMany({
      where: or(
        like(manga.title, `%${query}%`),
        like(manga.description || "", `%${query}%`),
        like(manga.author || "", `%${query}%`),
      ),
      orderBy: desc(manga.title),
    });
  },

  async getWithProgress() {
    const results = await db
      .select({
        manga: manga,
        progress: readingProgress,
        chapterCount: count(chapters.id),
      })
      .from(manga)
      .leftJoin(readingProgress, eq(manga.id, readingProgress.mangaId))
      .leftJoin(chapters, eq(manga.id, chapters.mangaId))
      .groupBy(manga.id)
      .orderBy(
        desc(sql`COALESCE(${readingProgress.lastReadAt}, ${manga.createdAt})`),
      );

    return results.map((r) => ({
      ...r.manga,
      progress: r.progress || undefined,
      chapterCount: r.chapterCount,
    }));
  },
};
