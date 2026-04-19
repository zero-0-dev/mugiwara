import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, readingProgress } from "../index";
import { chapters } from "../schema";

// Helper function to calculate percentComplete from pageNumber and totalPages
export function calculatePercentComplete(
  pageNumber: number,
  totalPages: number,
): number {
  if (totalPages <= 0) return 0;
  return Math.round((pageNumber / totalPages) * 100);
}

// Helper function to check if chapter is completed
export function calculateIsCompleted(
  pageNumber: number,
  totalPages: number,
): boolean {
  if (totalPages <= 0) return false;
  // Consider completed if on last page or >= 95% complete
  return (
    pageNumber >= totalPages ||
    calculatePercentComplete(pageNumber, totalPages) >= 95
  );
}

// Helper to add calculated fields to a progress record
export function enrichProgressRecord(
  record: typeof readingProgress.$inferSelect | null | undefined,
) {
  if (!record) return null;
  const percentComplete = calculatePercentComplete(
    record.pageNumber,
    record.totalPages,
  );
  const isCompleted = calculateIsCompleted(
    record.pageNumber,
    record.totalPages,
  );
  return {
    ...record,
    percentComplete,
    isCompleted,
  };
}

// Helper to enrich an array of progress records
export function enrichProgressRecords(
  records: (typeof readingProgress.$inferSelect)[],
) {
  return records.map((record) => enrichProgressRecord(record)!);
}

export const progressRepository = {
  async findByMangaId(mangaId: string) {
    const record = await db.query.readingProgress.findFirst({
      where: eq(readingProgress.mangaId, mangaId),
      orderBy: desc(readingProgress.lastReadAt),
    });
    return enrichProgressRecord(record);
  },

  async findByMangaAndDevice(mangaId: string, deviceId?: string) {
    let record;
    if (deviceId) {
      record = await db.query.readingProgress.findFirst({
        where: and(
          eq(readingProgress.mangaId, mangaId),
          eq(readingProgress.deviceId, deviceId),
        ),
        orderBy: desc(readingProgress.lastReadAt),
      });
    } else {
      record = await db.query.readingProgress.findFirst({
        where: eq(readingProgress.mangaId, mangaId),
        orderBy: desc(readingProgress.lastReadAt),
      });
    }
    return enrichProgressRecord(record);
  },

  async findByChapterId(mangaId: string, chapterId: string, deviceId?: string) {
    const conditions = [
      eq(readingProgress.mangaId, mangaId),
      eq(readingProgress.chapterId, chapterId),
    ];
    if (deviceId) {
      conditions.push(eq(readingProgress.deviceId, deviceId));
    }
    const record = await db.query.readingProgress.findFirst({
      where: and(...conditions),
    });
    return enrichProgressRecord(record);
  },

  async findAllByMangaId(mangaId: string, deviceId?: string) {
    const conditions = [eq(readingProgress.mangaId, mangaId)];
    if (deviceId) {
      conditions.push(eq(readingProgress.deviceId, deviceId));
    }
    const records = await db.query.readingProgress.findMany({
      where: and(...conditions),
      orderBy: desc(readingProgress.lastReadAt),
    });
    return enrichProgressRecords(records);
  },

  async findById(id: string) {
    const record = await db.query.readingProgress.findFirst({
      where: eq(readingProgress.id, id),
    });
    return enrichProgressRecord(record);
  },

  async create(data: typeof readingProgress.$inferInsert) {
    const result = await db.insert(readingProgress).values(data).returning();
    return enrichProgressRecord(result[0])!;
  },

  async update(id: string, data: Partial<typeof readingProgress.$inferInsert>) {
    const result = await db
      .update(readingProgress)
      .set({ ...data, lastReadAt: new Date().toISOString() })
      .where(eq(readingProgress.id, id))
      .returning();
    return enrichProgressRecord(result[0])!;
  },

  // New upsert that properly keys by mangaId + chapterId + deviceId
  async upsert(data: typeof readingProgress.$inferInsert) {
    // Build the key conditions: mangaId + chapterId + optional deviceId
    const conditions: any[] = [eq(readingProgress.mangaId, data.mangaId)];

    // Only add chapterId condition if it's provided
    if (data.chapterId) {
      conditions.push(eq(readingProgress.chapterId, data.chapterId));
    } else {
      // If no chapterId, look for records with null chapterId
      conditions.push(eq(readingProgress.chapterId, null as any));
    }

    if (data.deviceId) {
      conditions.push(eq(readingProgress.deviceId, data.deviceId));
    }

    const existing = await db.query.readingProgress.findFirst({
      where: and(...conditions),
    });

    if (existing) {
      return await this.update(existing.id, {
        pageNumber: data.pageNumber,
        totalPages: data.totalPages,
      });
    }

    const result = await this.create(data);
    return result;
  },

  // Legacy upsert for backward compatibility (keys by mangaId + deviceId only)
  async upsertByManga(data: typeof readingProgress.$inferInsert) {
    const existing = await this.findByMangaAndDevice(
      data.mangaId,
      data.deviceId || undefined,
    );

    if (existing) {
      return await this.update(existing.id, {
        chapterId: data.chapterId,
        pageNumber: data.pageNumber,
        totalPages: data.totalPages,
      });
    }

    const result = await this.create(data);
    return result;
  },

  // Mark specific chapters as completed/incomplete
  // Completed = set pageNumber to totalPages
  // Incomplete = set pageNumber to 1
  async markChaptersComplete(
    mangaId: string,
    chapterIds: string[],
    shouldComplete: boolean,
    deviceId?: string,
  ) {
    const now = new Date().toISOString();

    // Build base conditions
    const baseConditions: any[] = [eq(readingProgress.mangaId, mangaId)];
    if (deviceId) {
      baseConditions.push(eq(readingProgress.deviceId, deviceId));
    }

    // Get existing progress records to know their totalPages
    const existingProgress = await db.query.readingProgress.findMany({
      where: and(
        ...baseConditions,
        // Filter by chapterIds
        sql`${readingProgress.chapterId} IN (${sql.join(
          chapterIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    });

    // Update existing records
    if (existingProgress.length > 0) {
      for (const progress of existingProgress) {
        if (shouldComplete) {
          // Mark as complete: set pageNumber to totalPages
          await db
            .update(readingProgress)
            .set({
              pageNumber: progress.totalPages,
              lastReadAt: now,
            })
            .where(eq(readingProgress.id, progress.id));
        } else {
          // Mark as incomplete: delete the record
          await db
            .delete(readingProgress)
            .where(eq(readingProgress.id, progress.id));
        }
      }
    }

    // For chapters without progress records that are being marked complete,
    // we need to create them with pageNumber = totalPages
    if (shouldComplete) {
      const existingChapterIds = new Set(
        existingProgress.map((p) => p.chapterId),
      );
      const missingChapterIds = chapterIds.filter(
        (id) => !existingChapterIds.has(id),
      );

      if (missingChapterIds.length > 0) {
        const { v4: uuidv4 } = await import("uuid");

        // Fetch chapter data to get totalPages
        const chapterData = await db.query.chapters.findMany({
          where: and(
            eq(chapters.mangaId, mangaId),
            inArray(chapters.id, missingChapterIds),
          ),
        });

        // Create a map of chapterId -> pagesCount
        const chapterPagesMap = new Map(
          chapterData.map((c) => [c.id, c.pagesCount]),
        );

        // Create progress records with pageNumber = totalPages
        await db.insert(readingProgress).values(
          missingChapterIds.map((chapterId) => {
            const totalPages = chapterPagesMap.get(chapterId) || 0;
            return {
              id: uuidv4(),
              mangaId,
              chapterId,
              pageNumber: totalPages, // Set to totalPages to mark as complete
              totalPages,
              deviceId: deviceId || null,
              lastReadAt: now,
            };
          }),
        );
      }
    }
  },

  async getRecent(limit: number = 20) {
    const records = await db.query.readingProgress.findMany({
      orderBy: desc(readingProgress.lastReadAt),
      limit,
    });
    return enrichProgressRecords(records);
  },

  async delete(id: string) {
    await db.delete(readingProgress).where(eq(readingProgress.id, id));
  },

  async deleteByMangaId(mangaId: string) {
    await db
      .delete(readingProgress)
      .where(eq(readingProgress.mangaId, mangaId));
  },
};
