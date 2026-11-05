import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { db, readingProgress } from "../index";
import { chapters } from "../schema";

/**
 * Device semantics
 * ----------------
 * Reading progress is stored per device: one row per
 * (mangaId, chapterId, deviceId). The web client persists a random UUID in
 * localStorage and sends it with every write, so the same chapter can have a
 * row for each device a reader uses. Library cards and filters use the most
 * recent row across all devices.
 *
 * Older clients do not send a device id. They are normalized to this stable
 * fallback so the unique index also prevents duplicate rows for them.
 */
export const DEFAULT_DEVICE_ID = "default";

export function normalizeDeviceId(deviceId?: string | null): string {
  const trimmed = deviceId?.trim();
  return trimmed ? trimmed : DEFAULT_DEVICE_ID;
}

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
          eq(readingProgress.deviceId, normalizeDeviceId(deviceId)),
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
      conditions.push(eq(readingProgress.deviceId, normalizeDeviceId(deviceId)));
    }
    const record = await db.query.readingProgress.findFirst({
      where: and(...conditions),
      orderBy: desc(readingProgress.lastReadAt),
    });
    return enrichProgressRecord(record);
  },

  async findAllByMangaId(mangaId: string, deviceId?: string) {
    const conditions = [eq(readingProgress.mangaId, mangaId)];
    if (deviceId) {
      conditions.push(eq(readingProgress.deviceId, normalizeDeviceId(deviceId)));
    }
    const records = await db.query.readingProgress.findMany({
      where: and(...conditions),
      orderBy: desc(readingProgress.lastReadAt),
    });

    // Without a device filter the same chapter can have one row per device.
    // Collapse them to the most recent row per chapter, which is the state the
    // detail screen and the library should show.
    if (!deviceId) {
      const seenChapters = new Set<string>();
      const latestPerChapter = records.filter((record) => {
        if (!record.chapterId) return true;
        if (seenChapters.has(record.chapterId)) return false;
        seenChapters.add(record.chapterId);
        return true;
      });
      return enrichProgressRecords(latestPerChapter);
    }

    return enrichProgressRecords(records);
  },

  async findById(id: string) {
    const record = await db.query.readingProgress.findFirst({
      where: eq(readingProgress.id, id),
    });
    return enrichProgressRecord(record);
  },

  async create(data: typeof readingProgress.$inferInsert) {
    const result = await db
      .insert(readingProgress)
      .values({
        ...data,
        deviceId: normalizeDeviceId(data.deviceId),
        lastReadAt: data.lastReadAt ?? new Date().toISOString(),
      })
      .returning();
    return enrichProgressRecord(result[0])!;
  },

  async update(id: string, data: Partial<typeof readingProgress.$inferInsert>) {
    const result = await db
      .update(readingProgress)
      .set({
        ...data,
        ...(data.deviceId !== undefined
          ? { deviceId: normalizeDeviceId(data.deviceId) }
          : {}),
        lastReadAt: data.lastReadAt ?? new Date().toISOString(),
      })
      .where(eq(readingProgress.id, id))
      .returning();
    return enrichProgressRecord(result[0])!;
  },

  /**
   * Atomic upsert keyed by (mangaId, chapterId, deviceId).
   *
   * SQLite serializes writers, and ON CONFLICT makes concurrent/duplicate
   * submissions collapse into the same row instead of racing a read-then-write
   * check. Rows without a chapter (the deprecated manga-level endpoint) cannot
   * match the unique key because NULLs are distinct in SQLite, so they use the
   * transactional fallback below.
   */
  async upsert(data: typeof readingProgress.$inferInsert) {
    const lastReadAt = data.lastReadAt ?? new Date().toISOString();
    const values = {
      ...data,
      deviceId: normalizeDeviceId(data.deviceId),
      lastReadAt,
    };

    if (!data.chapterId) {
      return this.upsertMangaLevel(values);
    }

    const result = await db
      .insert(readingProgress)
      .values(values)
      .onConflictDoUpdate({
        target: [
          readingProgress.mangaId,
          readingProgress.chapterId,
          readingProgress.deviceId,
        ],
        set: {
          pageNumber: values.pageNumber ?? 1,
          totalPages: values.totalPages ?? 0,
          lastReadAt,
        },
      })
      .returning();

    return enrichProgressRecord(result[0])!;
  },

  // Transactional fallback for the deprecated manga-level progress endpoint,
  // where there is no chapter id to include in the unique key.
  async upsertMangaLevel(data: typeof readingProgress.$inferInsert) {
    const deviceId = normalizeDeviceId(data.deviceId);
    const lastReadAt = data.lastReadAt ?? new Date().toISOString();

    return db.transaction((tx) => {
      const existing = tx
        .select()
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.mangaId, data.mangaId),
            isNull(readingProgress.chapterId),
            eq(readingProgress.deviceId, deviceId),
          ),
        )
        .orderBy(desc(readingProgress.lastReadAt))
        .get();

      if (existing) {
        const updated = tx
          .update(readingProgress)
          .set({
            chapterId: data.chapterId ?? null,
            pageNumber: data.pageNumber ?? 1,
            totalPages: data.totalPages ?? 0,
            lastReadAt,
          })
          .where(eq(readingProgress.id, existing.id))
          .returning()
          .get();
        return enrichProgressRecord(updated)!;
      }

      const created = tx
        .insert(readingProgress)
        .values({
          ...data,
          deviceId,
          lastReadAt,
        })
        .returning()
        .get();
      return enrichProgressRecord(created)!;
    });
  },

  // Legacy upsert for backward compatibility (keys by mangaId + deviceId only)
  async upsertByManga(data: typeof readingProgress.$inferInsert) {
    // If a chapter id is present this is really per-chapter progress and can
    // use the atomic unique-key path. Otherwise fall back to the manga-level
    // transactional upsert.
    return this.upsert(data);
  },

  // Mark specific chapters as completed/incomplete
  // Completed = set pageNumber to totalPages
  // Incomplete = delete the progress row
  async markChaptersComplete(
    mangaId: string,
    chapterIds: string[],
    shouldComplete: boolean,
    deviceId?: string,
  ) {
    if (chapterIds.length === 0) return;

    const now = new Date().toISOString();
    const normalizedDeviceId = normalizeDeviceId(deviceId);

    // Build base conditions
    const baseConditions: any[] = [
      eq(readingProgress.mangaId, mangaId),
      eq(readingProgress.deviceId, normalizedDeviceId),
    ];

    // Get existing progress records to know their totalPages
    const existingProgress = await db.query.readingProgress.findMany({
      where: and(
        ...baseConditions,
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

        // Create progress records with pageNumber = totalPages. Ignore
        // conflicts in case another request created the same row first.
        await db
          .insert(readingProgress)
          .values(
            missingChapterIds.map((chapterId) => {
              const totalPages = chapterPagesMap.get(chapterId) || 0;
              return {
                id: uuidv4(),
                mangaId,
                chapterId,
                pageNumber: totalPages, // Set to totalPages to mark as complete
                totalPages,
                deviceId: normalizedDeviceId,
                lastReadAt: now,
              };
            }),
          )
          .onConflictDoNothing();
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

  /**
   * Deletes progress for the given chapters across every device. Used when the
   * user explicitly resolves a tracker conflict in favour of a lower remote
   * progress count.
   */
  async clearChapterProgress(mangaId: string, chapterIds: string[]) {
    if (chapterIds.length === 0) return;
    await db
      .delete(readingProgress)
      .where(
        and(
          eq(readingProgress.mangaId, mangaId),
          inArray(readingProgress.chapterId, chapterIds),
        ),
      );
  },

  async deleteByMangaId(mangaId: string) {
    await db
      .delete(readingProgress)
      .where(eq(readingProgress.mangaId, mangaId));
  },
};
