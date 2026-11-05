import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  MangaStorageUsage,
  PluginMetadata,
  StorageBackend,
} from "@mugiwara-manga/plugin-api";

import {
  chapters,
  closeDatabase,
  db,
  initDatabase,
  manga,
  readingProgress,
} from "../src/database";
import {
  deleteChapterDownload,
  deleteMangaDownloads,
  getStorageUsage,
  type StorageUsageDeps,
} from "../src/services/storage-usage";

const metadata: PluginMetadata = {
  id: "fake",
  name: "Fake Storage",
  version: "1.0.0",
  type: "storage",
  compatibleCore: "^1.0.0",
};

class FakeBackend implements StorageBackend {
  readonly metadata = metadata;
  readonly bytes = new Map<string, number>();
  readonly failDelete = new Set<string>();
  readonly deleted: string[] = [];
  bulkCalls = 0;

  private key(mangaId: string, chapterId: string): string {
    return `${mangaId}:${chapterId}`;
  }

  setSize(mangaId: string, chapterId: string, bytes: number): void {
    this.bytes.set(this.key(mangaId, chapterId), bytes);
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  async writeChapterPage(): Promise<void> {
    throw new Error("not implemented");
  }

  async readChapterPage(): Promise<Buffer> {
    throw new Error("not implemented");
  }

  async listChapterPages(): Promise<number> {
    return 0;
  }

  getPageUrl(): string {
    return "";
  }

  async getChapterSize(mangaId: string, chapterId: string): Promise<number> {
    return this.bytes.get(this.key(mangaId, chapterId)) ?? 0;
  }

  async getMangaUsage(
    mangaId: string,
    chapterIds?: string[],
  ): Promise<MangaStorageUsage> {
    this.bulkCalls++;
    const ids = chapterIds ?? [];
    const entries = ids.map((chapterId) => ({
      chapterId,
      bytes: this.bytes.get(this.key(mangaId, chapterId)) ?? 0,
      exists: this.bytes.has(this.key(mangaId, chapterId)),
    }));
    return {
      mangaId,
      totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      chapters: entries,
    };
  }

  async deleteChapter(mangaId: string, chapterId: string): Promise<void> {
    if (this.failDelete.has(this.key(mangaId, chapterId))) {
      throw new Error("storage unavailable");
    }
    this.deleted.push(chapterId);
    this.bytes.delete(this.key(mangaId, chapterId));
  }

  async deleteManga(): Promise<void> {}
}

const MANGA_A = "manga-a";
const MANGA_B = "manga-b";
const MANGA_C = "manga-c";

let backend: FakeBackend;
let deps: StorageUsageDeps;
let cancelChapterTasks: ReturnType<typeof vi.fn>;

async function seed(): Promise<void> {
  await db.delete(readingProgress);
  await db.delete(chapters);
  await db.delete(manga);

  await db.insert(manga).values([
    {
      id: MANGA_A,
      title: "Alpha",
      sourceId: "local",
      status: "ongoing",
      mediaType: "manga",
    },
    {
      id: MANGA_B,
      title: "Bravo",
      sourceId: "local",
      status: "completed",
      mediaType: "manga",
    },
    {
      id: MANGA_C,
      title: "Charlie",
      sourceId: "local",
      status: "ongoing",
      mediaType: "manhwa",
    },
  ]);

  await db.insert(chapters).values([
    {
      id: "a-1",
      mangaId: MANGA_A,
      chapterId: "1",
      title: "Alpha One",
      pagesCount: 5,
      sortOrder: 1,
      importStatus: "complete",
    },
    {
      id: "a-2",
      mangaId: MANGA_A,
      chapterId: "2",
      title: "Alpha Two",
      pagesCount: 0,
      sortOrder: 2,
      importStatus: "pending",
    },
    {
      id: "b-1",
      mangaId: MANGA_B,
      chapterId: "1",
      title: "Bravo One",
      pagesCount: 2,
      sortOrder: 1,
      importStatus: "complete",
    },
    {
      id: "c-1",
      mangaId: MANGA_C,
      chapterId: "1",
      pagesCount: 0,
      sortOrder: 1,
      importStatus: "pending",
    },
  ]);

  await db.insert(readingProgress).values([
    {
      id: "a-progress-old",
      mangaId: MANGA_A,
      chapterId: "a-1",
      pageNumber: 2,
      totalPages: 5,
      deviceId: "phone",
      lastReadAt: "2024-05-01T00:00:00.000Z",
    },
    {
      id: "a-progress-new",
      mangaId: MANGA_A,
      chapterId: "a-1",
      pageNumber: 3,
      totalPages: 5,
      deviceId: "web",
      lastReadAt: "2024-06-01T00:00:00.000Z",
    },
    {
      id: "b-progress",
      mangaId: MANGA_B,
      chapterId: "b-1",
      pageNumber: 1,
      totalPages: 2,
      deviceId: "web",
      lastReadAt: "2024-01-01T00:00:00.000Z",
    },
  ]);

  backend.setSize(MANGA_A, "1", 1000);
  backend.setSize(MANGA_B, "1", 4000);
}

beforeAll(() => {
  initDatabase();
});

beforeEach(async () => {
  backend = new FakeBackend();
  cancelChapterTasks = vi.fn(async () => undefined);
  deps = {
    db,
    getBackendForManga: async () => backend,
    cancelChapterTasks,
  };
  await seed();
});

afterAll(() => {
  closeDatabase();
});

describe("storage usage", () => {
  it("aggregates downloaded chapters, sizes and latest read time", async () => {
    const result = await getStorageUsage(deps);

    expect(result.summary).toEqual({
      totalBytes: 5000,
      mangaWithDownloads: 2,
      downloadedChapters: 2,
    });

    const [bravo, alpha, charlie] = result.manga;
    expect(bravo).toMatchObject({
      mangaId: MANGA_B,
      downloadedChapterCount: 1,
      totalBytes: 4000,
      lastReadAt: "2024-01-01T00:00:00.000Z",
    });
    expect(alpha).toMatchObject({
      mangaId: MANGA_A,
      downloadedChapterCount: 1,
      totalBytes: 1000,
      // Most recent row across devices, not the first inserted row.
      lastReadAt: "2024-06-01T00:00:00.000Z",
    });
    expect(charlie).toMatchObject({
      mangaId: MANGA_C,
      downloadedChapterCount: 0,
      totalBytes: 0,
      lastReadAt: null,
    });

    // One bulk listing per manga with candidate chapters, and none for the
    // manga that has nothing downloaded.
    expect(backend.bulkCalls).toBe(2);
  });

  it("sorts by size and last read in both directions", async () => {
    const sizeAsc = await getStorageUsage(deps, {
      sort: "size",
      order: "asc",
    });
    expect(sizeAsc.manga.map((row) => row.mangaId)).toEqual([
      MANGA_C,
      MANGA_A,
      MANGA_B,
    ]);

    const sizeDesc = await getStorageUsage(deps, {
      sort: "size",
      order: "desc",
    });
    expect(sizeDesc.manga.map((row) => row.mangaId)).toEqual([
      MANGA_B,
      MANGA_A,
      MANGA_C,
    ]);

    const lastReadAsc = await getStorageUsage(deps, {
      sort: "lastRead",
      order: "asc",
    });
    expect(lastReadAsc.manga.map((row) => row.mangaId)).toEqual([
      MANGA_B,
      MANGA_A,
      MANGA_C,
    ]);

    const lastReadDesc = await getStorageUsage(deps, {
      sort: "lastRead",
      order: "desc",
    });
    expect(lastReadDesc.manga.map((row) => row.mangaId)).toEqual([
      MANGA_A,
      MANGA_B,
      MANGA_C,
    ]);
  });

  it("falls back to per-chapter size queries when bulk usage is unavailable", async () => {
    const fallback = Object.create(FakeBackend.prototype) as FakeBackend;
    Object.assign(fallback, backend);
    fallback.getMangaUsage = undefined as never;
    const fallbackDeps: StorageUsageDeps = {
      ...deps,
      getBackendForManga: async () => fallback,
    };

    const result = await getStorageUsage(fallbackDeps, {
      sort: "size",
      order: "desc",
    });
    expect(result.manga[0]?.mangaId).toBe(MANGA_B);
    expect(result.summary.totalBytes).toBe(5000);
  });

  it("returns a per-manga error instead of failing the whole page", async () => {
    const failingDeps: StorageUsageDeps = {
      ...deps,
      getBackendForManga: async (mangaId) => {
        if (mangaId === MANGA_B) throw new Error("backend offline");
        return backend;
      },
    };

    const result = await getStorageUsage(failingDeps);
    const bravo = result.manga.find((row) => row.mangaId === MANGA_B);
    expect(bravo?.error).toBe("backend offline");
    // The other rows still load and contribute to the summary.
    expect(result.summary.totalBytes).toBe(1000);
  });
});

describe("deleting downloads", () => {
  it("deletes all downloaded chapters for a manga and keeps progress", async () => {
    const result = await deleteMangaDownloads(deps, MANGA_A);

    expect(result).toMatchObject({
      mangaId: MANGA_A,
      deletedCount: 1,
      failedCount: 0,
      bytesFreed: 1000,
    });
    expect(result.results[0]).toMatchObject({
      chapterId: "1",
      chapterRecordId: "a-1",
      success: true,
      bytesFreed: 1000,
    });
    expect(cancelChapterTasks).toHaveBeenCalledWith(MANGA_A, "1");
    expect(backend.deleted).toEqual(["1"]);

    const [alphaChapter, alphaPending] = await db.query.chapters.findMany({
      where: eq(chapters.mangaId, MANGA_A),
      orderBy: (table, { asc }) => [asc(table.sortOrder)],
    });
    expect(alphaChapter).toMatchObject({
      importStatus: "pending",
      importProgress: 0,
      pagesCount: 0,
      // Chapter content metadata is preserved.
      title: "Alpha One",
      sortOrder: 1,
    });
    // A chapter that never had files is left alone.
    expect(alphaPending).toMatchObject({
      importStatus: "pending",
      pagesCount: 0,
    });

    const progress = await db.query.readingProgress.findMany({
      where: eq(readingProgress.mangaId, MANGA_A),
    });
    expect(progress).toHaveLength(2);

    // The other manga is untouched.
    const bravoChapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, "b-1"),
    });
    expect(bravoChapter).toMatchObject({
      importStatus: "complete",
      pagesCount: 2,
    });
  });

  it("deletes a single chapter and allows the same delete to run again", async () => {
    const first = await deleteChapterDownload(deps, MANGA_B, "1");
    expect(first).toMatchObject({
      chapterId: "1",
      success: true,
      bytesFreed: 4000,
    });
    expect(cancelChapterTasks).toHaveBeenCalledWith(MANGA_B, "1");

    const chapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, "b-1"),
    });
    expect(chapter).toMatchObject({
      importStatus: "pending",
      importProgress: 0,
      pagesCount: 0,
    });

    // Missing files are fine: the second call still succeeds and resets state.
    await db
      .update(chapters)
      .set({ importStatus: "complete", pagesCount: 2 })
      .where(eq(chapters.id, "b-1"));

    const second = await deleteChapterDownload(deps, MANGA_B, "1");
    expect(second).toMatchObject({
      chapterId: "1",
      success: true,
      bytesFreed: 0,
    });

    const progressRows = await db.query.readingProgress.findMany({
      where: eq(readingProgress.mangaId, MANGA_B),
    });
    expect(progressRows).toHaveLength(1);
  });

  it("returns null for an unknown chapter", async () => {
    await expect(
      deleteChapterDownload(deps, MANGA_B, "does-not-exist"),
    ).resolves.toBeNull();
  });

  it("leaves chapter state unchanged when the backend delete fails", async () => {
    backend.failDelete.add(`${MANGA_B}:1`);

    const result = await deleteMangaDownloads(deps, MANGA_B);

    expect(result).toMatchObject({
      deletedCount: 0,
      failedCount: 1,
      bytesFreed: 0,
    });
    expect(result.results[0]).toMatchObject({
      chapterId: "1",
      success: false,
      error: "storage unavailable",
    });

    const chapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, "b-1"),
    });
    expect(chapter).toMatchObject({
      importStatus: "complete",
      pagesCount: 2,
    });

    const progressRows = await db.query.readingProgress.findMany({
      where: eq(readingProgress.mangaId, MANGA_B),
    });
    expect(progressRows).toHaveLength(1);
  });

  it("continues past a failed chapter and reports partial results", async () => {
    await db.insert(chapters).values({
      id: "a-3",
      mangaId: MANGA_A,
      chapterId: "3",
      title: "Alpha Three",
      pagesCount: 1,
      sortOrder: 3,
      importStatus: "complete",
    });
    backend.setSize(MANGA_A, "3", 250);
    backend.failDelete.add(`${MANGA_A}:1`);

    const result = await deleteMangaDownloads(deps, MANGA_A);

    expect(result.deletedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.bytesFreed).toBe(250);
    expect(result.results).toHaveLength(2);

    const failedChapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, "a-1"),
    });
    const successfulChapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, "a-3"),
    });
    expect(failedChapter?.importStatus).toBe("complete");
    expect(successfulChapter?.importStatus).toBe("pending");
  });
});

describe("local storage sizes", () => {
  let basePath: string;
  let LocalStorage: typeof import("../../../packages/storage-local/src/index").LocalStorage;

  beforeAll(async () => {
    ({ LocalStorage } =
      await import("../../../packages/storage-local/src/index"));
  });

  beforeEach(async () => {
    basePath = mkdtempSync(join(tmpdir(), "mugiwara-usage-local-"));
  });

  afterAll(() => {
    rmSync(basePath, { recursive: true, force: true });
  });

  it("measures archive files and directory chapters from metadata", async () => {
    const storage = new LocalStorage();
    await storage.initialize({ basePath });

    const chapterDir = join(basePath, "manga", "chapters", "1");
    await mkdir(chapterDir, { recursive: true });
    await writeFile(join(chapterDir, "001.jpg"), Buffer.alloc(100));
    await writeFile(join(chapterDir, "002.png"), Buffer.alloc(50));
    await writeFile(join(chapterDir, ".003.jpg.123.tmp"), Buffer.alloc(999));

    const archiveDir = join(basePath, "manga", "chapters", "2");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, "001.cbz"), Buffer.alloc(500));

    await expect(storage.getChapterSize("manga", "1")).resolves.toBe(150);
    await expect(storage.getChapterSize("manga", "2")).resolves.toBe(500);

    const usage = await storage.getMangaUsage("manga");
    expect(usage.totalBytes).toBe(650);
    expect(usage.chapters).toEqual(
      expect.arrayContaining([
        { chapterId: "1", bytes: 150, exists: true },
        { chapterId: "2", bytes: 500, exists: true },
      ]),
    );

    await storage.deleteChapter("manga", "1");
    await expect(storage.getChapterSize("manga", "1")).resolves.toBe(0);
    const afterDelete = await storage.getMangaUsage("manga", ["1"]);
    expect(afterDelete.chapters[0]).toEqual({
      chapterId: "1",
      bytes: 0,
      exists: false,
    });
  });

  it("deletes archive and directory chapters and allows downloading again", async () => {
    const storage = new LocalStorage();
    await storage.initialize({ basePath });

    const archiveDir = join(basePath, "manga", "chapters", "1");
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, "001.cbz"), Buffer.alloc(500));

    const directoryDir = join(basePath, "manga", "chapters", "2");
    await mkdir(directoryDir, { recursive: true });
    await writeFile(join(directoryDir, "001.jpg"), Buffer.alloc(100));
    await writeFile(join(directoryDir, "002.png"), Buffer.alloc(50));

    await storage.deleteChapter("manga", "1");
    await storage.deleteChapter("manga", "2");
    await expect(storage.getChapterSize("manga", "1")).resolves.toBe(0);
    await expect(storage.getChapterSize("manga", "2")).resolves.toBe(0);

    // A chapter that was deleted is writable again, so the user can download
    // it again and usage reflects the new files.
    await storage.writeChapterPage(
      "manga",
      "2",
      1,
      Buffer.alloc(120),
      "image/jpeg",
    );
    await expect(storage.getChapterSize("manga", "2")).resolves.toBe(120);
  });

  it("keeps deletion idempotent for missing chapters but propagates real failures", async () => {
    const storage = new LocalStorage();
    await storage.initialize({ basePath });

    // Deleting an already-missing chapter succeeds...
    await expect(
      storage.deleteChapter("manga", "missing"),
    ).resolves.toBeUndefined();

    // ...but a broken storage layout must not be reported as a successful
    // delete, otherwise the database would claim files were freed.
    await writeFile(join(basePath, "not-a-directory"), Buffer.alloc(10));
    await expect(
      storage.deleteChapter("not-a-directory", "1"),
    ).rejects.toMatchObject({ code: "ENOTDIR" });
  });
});
