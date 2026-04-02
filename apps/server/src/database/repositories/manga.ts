import { eq, like, or, and, desc, sql, count } from 'drizzle-orm';
import { db, manga, chapters, readingProgress } from '../index';

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
        eq(manga.sourceMangaId, sourceMangaId)
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
    await db.delete(manga).where(eq(manga.id, id));
  },

  async search(query: string) {
    return await db.query.manga.findMany({
      where: or(
        like(manga.title, `%${query}%`),
        like(manga.description || '', `%${query}%`),
        like(manga.author || '', `%${query}%`)
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
      .orderBy(desc(sql`COALESCE(${readingProgress.lastReadAt}, ${manga.createdAt})`));

    return results.map(r => ({
      ...r.manga,
      progress: r.progress || undefined,
      chapterCount: r.chapterCount,
    }));
  },
};
