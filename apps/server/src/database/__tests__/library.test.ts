import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The database module reads DATA_DIR when it is imported, so configure a
// throwaway directory before loading it. Tests then run the real migrations.
const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-library-test-"));
process.env.DATA_DIR = dataDir;

type DatabaseModule = typeof import("../index");

let database: DatabaseModule;

const MANGA_A = "manga-a";
const MANGA_B = "manga-b";
const MANGA_C = "manga-c";

const chaptersA = Array.from({ length: 8 }, (_, index) => ({
  id: `a-chapter-${index + 1}`,
  chapterId: `${index + 1}`,
  sortOrder: index + 1,
}));

beforeAll(async () => {
  database = await import("../index");
  database.initDatabase();

  const { mangaRepository, chapterRepository, progressRepository } = database;

  await mangaRepository.create({
    id: MANGA_A,
    title: "Fixture A",
    sourceId: "local",
    status: "ongoing",
    mediaType: "manga",
  });

  for (const chapter of chaptersA) {
    await chapterRepository.create({
      mangaId: MANGA_A,
      chapterId: chapter.chapterId,
      sortOrder: chapter.sortOrder,
      pagesCount: 10,
      importStatus: "complete",
      id: chapter.id,
    });
  }

  // Three progress rows: one completed (oldest), one in progress (newest),
  // one older in-progress row. Chapter counts must stay at 8.
  await progressRepository.upsert({
    id: "a-progress-1",
    mangaId: MANGA_A,
    chapterId: chaptersA[0]!.id,
    pageNumber: 10,
    totalPages: 10,
    deviceId: "old-device",
    lastReadAt: "2024-01-01T00:00:00.000Z",
  });
  await progressRepository.upsert({
    id: "a-progress-2",
    mangaId: MANGA_A,
    chapterId: chaptersA[1]!.id,
    pageNumber: 5,
    totalPages: 10,
    deviceId: "web",
    lastReadAt: "2024-03-01T00:00:00.000Z",
  });
  await progressRepository.upsert({
    id: "a-progress-3",
    mangaId: MANGA_A,
    chapterId: chaptersA[2]!.id,
    pageNumber: 2,
    totalPages: 10,
    deviceId: "old-device",
    lastReadAt: "2024-02-01T00:00:00.000Z",
  });

  await mangaRepository.create({
    id: MANGA_B,
    title: "Fixture B",
    sourceId: "local",
    status: "completed",
    mediaType: "manga",
  });
  for (let index = 1; index <= 2; index += 1) {
    const chapterId = `b-chapter-${index}`;
    await chapterRepository.create({
      id: chapterId,
      mangaId: MANGA_B,
      chapterId: `${index}`,
      sortOrder: index,
      pagesCount: 10,
      importStatus: "complete",
    });
    await progressRepository.upsert({
      id: `b-progress-${index}`,
      mangaId: MANGA_B,
      chapterId,
      pageNumber: 10,
      totalPages: 10,
      deviceId: "web",
      lastReadAt: `2024-04-0${index}T00:00:00.000Z`,
    });
  }

  await mangaRepository.create({
    id: MANGA_C,
    title: "Fixture C",
    sourceId: "local",
    status: "ongoing",
    mediaType: "manhwa",
  });
});

afterAll(() => {
  database.closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("library aggregation", () => {
  it("returns distinct chapter counts and the latest enriched progress per manga", async () => {
    const library = await database.libraryRepository.findAll({
      sortBy: "title",
      sortOrder: "asc",
    });

    const fixture = library.find((item) => item.id === MANGA_A);
    expect(fixture).toBeDefined();
    expect(fixture?.chapterCount).toBe(8);
    expect(fixture?.readingStatus).toBe("reading");
    // Manga progress is completed chapters / total chapters (1 of 8), not the
    // 50% the reader happens to be through the last opened chapter.
    expect(fixture?.progressPercent).toBe(13);
    expect(fixture?.progress).toMatchObject({
      chapterId: "a-chapter-2",
      pageNumber: 5,
      totalPages: 10,
      percentComplete: 50,
      isCompleted: false,
      deviceId: "web",
    });
    // No raw database row fields (snake_case) leak into the response.
    expect(fixture?.progress).not.toHaveProperty("page_number");
  });

  it("computes manga progress from completed chapters", async () => {
    const library = await database.libraryRepository.findAll({
      sortBy: "title",
      sortOrder: "asc",
    });

    const byId = new Map(library.map((item) => [item.id, item]));
    // One of eight chapters is completed.
    expect(byId.get(MANGA_A)?.progressPercent).toBe(13);
    // Every chapter is completed.
    expect(byId.get(MANGA_B)?.progressPercent).toBe(100);
    // No chapters at all.
    expect(byId.get(MANGA_C)?.progressPercent).toBe(0);
  });

  it("sorts by manga progress rather than last-chapter progress", async () => {
    const descending = await database.libraryRepository.findAll({
      sortBy: "progress",
      sortOrder: "desc",
    });
    expect(descending.map((item) => item.id)).toEqual([
      MANGA_B,
      MANGA_A,
      MANGA_C,
    ]);

    const ascending = await database.libraryRepository.findAll({
      sortBy: "progress",
      sortOrder: "asc",
    });
    expect(ascending.map((item) => item.id)).toEqual([
      MANGA_C,
      MANGA_A,
      MANGA_B,
    ]);
  });

  it("returns the same counts through the legacy getWithProgress path", async () => {
    const legacy = await database.mangaRepository.getWithProgress();
    const fixture = legacy.find((item) => item.id === MANGA_A);

    expect(fixture?.chapterCount).toBe(8);
    expect(fixture?.progressPercent).toBe(13);
    expect(fixture?.progress?.percentComplete).toBe(50);
  });

  it("filters by manga-level reading status", async () => {
    const reading = await database.libraryRepository.findAll({
      readingStatus: "reading",
    });
    const completed = await database.libraryRepository.findAll({
      readingStatus: "completed",
    });
    const notStarted = await database.libraryRepository.findAll({
      readingStatus: "not-started",
    });

    expect(reading.map((item) => item.id)).toEqual([MANGA_A]);
    expect(completed.map((item) => item.id)).toEqual([MANGA_B]);
    expect(notStarted.map((item) => item.id)).toEqual([MANGA_C]);
  });

  it("counts distinct manga in filter options", async () => {
    const options = await database.libraryRepository.getFilterOptions();

    expect(options.readingStatus).toEqual({
      total: 3,
      reading: 1,
      completed: 1,
      notStarted: 1,
    });
    expect(options.readingStatus.notStarted).toBeGreaterThanOrEqual(0);
  });

  it("collapses duplicate concurrent progress submissions into one row", async () => {
    const [first, second] = await Promise.all([
      database.progressRepository.upsert({
        id: "duplicate-1",
        mangaId: MANGA_A,
        chapterId: chaptersA[3]!.id,
        pageNumber: 6,
        totalPages: 10,
        deviceId: "web",
      }),
      database.progressRepository.upsert({
        id: "duplicate-2",
        mangaId: MANGA_A,
        chapterId: chaptersA[3]!.id,
        pageNumber: 7,
        totalPages: 10,
        deviceId: "web",
      }),
    ]);

    const rows = await database.db.query.readingProgress.findMany({
      where: and(
        eq(database.readingProgress.mangaId, MANGA_A),
        eq(database.readingProgress.chapterId, chaptersA[3]!.id),
        eq(database.readingProgress.deviceId, "web"),
      ),
    });

    expect(rows).toHaveLength(1);
    expect([first.pageNumber, second.pageNumber]).toContain(rows[0]!.pageNumber);
  });
});
