import { eq, and, gt, lt, asc, desc } from "drizzle-orm";
import { db, chapters } from "../index";

export const chapterRepository = {
  async findByMangaId(mangaId: string) {
    return await db.query.chapters.findMany({
      where: eq(chapters.mangaId, mangaId),
      orderBy: asc(chapters.sortOrder),
    });
  },

  async findById(id: string) {
    return await db.query.chapters.findFirst({
      where: eq(chapters.id, id),
    });
  },

  async findByChapterId(mangaId: string, chapterId: string) {
    return await db.query.chapters.findFirst({
      where: and(
        eq(chapters.mangaId, mangaId),
        eq(chapters.chapterId, chapterId),
      ),
    });
  },

  async create(data: typeof chapters.$inferInsert) {
    const result = await db.insert(chapters).values(data).returning();
    return result[0];
  },

  async update(id: string, data: Partial<typeof chapters.$inferInsert>) {
    const result = await db
      .update(chapters)
      .set(data)
      .where(eq(chapters.id, id))
      .returning();
    return result[0];
  },

  async delete(id: string) {
    await db.delete(chapters).where(eq(chapters.id, id));
  },

  async deleteByMangaId(mangaId: string) {
    await db.delete(chapters).where(eq(chapters.mangaId, mangaId));
  },

  async getNextChapter(mangaId: string, currentSortOrder: number) {
    return await db.query.chapters.findFirst({
      where: and(
        eq(chapters.mangaId, mangaId),
        gt(chapters.sortOrder, currentSortOrder),
      ),
      orderBy: asc(chapters.sortOrder),
    });
  },

  async getPreviousChapter(mangaId: string, currentSortOrder: number) {
    return await db.query.chapters.findFirst({
      where: and(
        eq(chapters.mangaId, mangaId),
        lt(chapters.sortOrder, currentSortOrder),
      ),
      orderBy: [desc(chapters.sortOrder)],
    });
  },
};
