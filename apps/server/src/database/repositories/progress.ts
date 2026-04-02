import { eq, and, desc, sql } from 'drizzle-orm';
import { db, readingProgress } from '../index';

export const progressRepository = {
  async findByMangaId(mangaId: string) {
    return await db.query.readingProgress.findFirst({
      where: eq(readingProgress.mangaId, mangaId),
    });
  },

  async findByMangaAndDevice(mangaId: string, deviceId?: string) {
    if (deviceId) {
      return await db.query.readingProgress.findFirst({
        where: and(
          eq(readingProgress.mangaId, mangaId),
          eq(readingProgress.deviceId, deviceId)
        ),
      });
    }
    return this.findByMangaId(mangaId);
  },

  async findById(id: string) {
    return await db.query.readingProgress.findFirst({
      where: eq(readingProgress.id, id),
    });
  },

  async create(data: typeof readingProgress.$inferInsert) {
    const result = await db.insert(readingProgress).values(data).returning();
    return result[0];
  },

  async update(id: string, data: Partial<typeof readingProgress.$inferInsert>) {
    const result = await db
      .update(readingProgress)
      .set({ ...data, lastReadAt: new Date().toISOString() })
      .where(eq(readingProgress.id, id))
      .returning();
    return result[0];
  },

  async upsert(data: typeof readingProgress.$inferInsert) {
    const existing = await this.findByMangaAndDevice(
      data.mangaId,
      data.deviceId || undefined
    );

    if (existing) {
      return await this.update(existing.id, {
        chapterId: data.chapterId,
        pageNumber: data.pageNumber,
        totalPages: data.totalPages,
        percentComplete: data.percentComplete,
        isCompleted: data.isCompleted,
      });
    }

    return await this.create(data);
  },

  async getRecent(limit: number = 20) {
    return await db.query.readingProgress.findMany({
      orderBy: desc(readingProgress.lastReadAt),
      limit,
    });
  },

  async delete(id: string) {
    await db.delete(readingProgress).where(eq(readingProgress.id, id));
  },

  async deleteByMangaId(mangaId: string) {
    await db.delete(readingProgress).where(eq(readingProgress.mangaId, mangaId));
  },
};
