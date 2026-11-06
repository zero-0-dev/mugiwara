import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import request from "supertest";
import sharp from "sharp";
import * as yazl from "yazl";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { PageData, SourceChapter } from "@mugiwara-manga/plugin-api";

import {
  chapters,
  closeDatabase,
  db,
  initDatabase,
  manga,
  readingProgress,
  storageBackends,
} from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";
import { registerBuiltInPlugins } from "../src/plugins";
import { ImportTaskRepository } from "../src/queue";
import { StorageManager } from "../src/storage";

const MANGA_ID = "on-demand-manga";
const CHAPTER_ROW_ID = "on-demand-chapter-row";

interface FakeSourceOptions {
  pageCount?: number;
  failAfter?: number;
  archive?: boolean;
}

async function makePage(color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width: 20, height: 30, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
}

function makeArchive(entries: Array<{ name: string; data: Buffer }>) {
  const zip = new yazl.ZipFile();
  for (const entry of entries) zip.addBuffer(entry.data, entry.name);

  const chunks: Buffer[] = [];
  zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
  zip.end();
  return completed;
}

function createSource(options: FakeSourceOptions = {}) {
  const sourceChapter: SourceChapter = {
    sourceChapterId: "source-chapter-1",
    chapterId: "1",
    sortOrder: 1,
    pageCount: options.pageCount,
  };

  return {
    getMangaDetails: async () => ({
      sourceMangaId: "source-manga",
      title: "On Demand",
      chapters: [sourceChapter],
    }),
    async *downloadChapter(): AsyncGenerator<PageData, void, unknown> {
      if (options.archive) {
        yield {
          pageNumber: 1,
          data: await makeArchive([
            { name: "001.jpg", data: await makePage({ r: 255, g: 0, b: 0 }) },
            { name: "002.jpg", data: await makePage({ r: 0, g: 0, b: 255 }) },
          ]),
          contentType: "application/zip",
        };
        return;
      }

      const pages = [
        { data: await makePage({ r: 255, g: 0, b: 0 }), contentType: "image/jpeg" },
        { data: await makePage({ r: 0, g: 0, b: 255 }), contentType: "image/jpeg" },
      ];

      for (let index = 0; index < pages.length; index++) {
        if (options.failAfter !== undefined && index === options.failAfter) {
          throw new Error("source failed midway");
        }
        yield {
          pageNumber: index + 1,
          data: pages[index].data,
          contentType: pages[index].contentType,
        };
      }
    },
  };
}

let app: ReturnType<typeof createApp>;
let auth: AuthService;
let storageManager: StorageManager;
let basePath: string;
let token: string;
let source: ReturnType<typeof createSource>;

function bearer() {
  return { Authorization: `Bearer ${token}` };
}

function pagesUrl() {
  return `/api/manga/${MANGA_ID}/chapters/${CHAPTER_ROW_ID}/pages`;
}

beforeAll(async () => {
  basePath = mkdtempSync(join(tmpdir(), "mugiwara-on-demand-"));
  initDatabase();
  await db
    .update(storageBackends)
    .set({ config: JSON.stringify({ basePath }) })
    .where(eq(storageBackends.id, "local-default"));

  registerBuiltInPlugins();
  storageManager = new StorageManager(db);
  await storageManager.initialize();
  (global as any).storageManager = storageManager;
  (global as any).taskRepository = new ImportTaskRepository(db);

  auth = new AuthService(db);
  token = (await auth.createToken("on demand test", true)).token;
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
});

beforeEach(async () => {
  await db.delete(readingProgress);
  await db.delete(chapters);
  await db.delete(manga);
  // Storage is shared by the whole file; each case starts without pages.
  await storageManager.getDefaultBackend()?.deleteChapter(MANGA_ID, "1");

  source = createSource();
  (global as any).pluginManager = {
    getSource: () => source,
  };

  await db.insert(manga).values({
    id: MANGA_ID,
    title: "On Demand Manga",
    sourceId: "fake",
    sourceMangaId: "source-manga",
    storageBackendId: "local-default",
  });
  await db.insert(chapters).values({
    id: CHAPTER_ROW_ID,
    mangaId: MANGA_ID,
    chapterId: "1",
    title: "One",
    pagesCount: 0,
    sortOrder: 1,
    importStatus: "pending",
    importProgress: 0,
  });
});

afterAll(() => {
  rmSync(basePath, { recursive: true, force: true });
  delete (global as any).pluginManager;
  closeDatabase();
});

describe("on-demand chapter reads", () => {
  it("persists the downloaded state so the chapter and its files are visible", async () => {
    const response = await request(app)
      .get(pagesUrl())
      .set(bearer())
      .expect(200);

    expect(response.body).toHaveLength(2);

    const chapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, CHAPTER_ROW_ID),
    });
    expect(chapter).toMatchObject({
      pagesCount: 2,
      importProgress: 100,
      importStatus: "complete",
    });

    const storage = storageManager.getDefaultBackend();
    if (!storage) throw new Error("default backend missing");
    await expect(
      storage.getChapterSize(MANGA_ID, "1"),
    ).resolves.toBeGreaterThan(0);

    const usage = await request(app)
      .get("/api/storage/usage")
      .set(bearer())
      .expect(200);
    expect(usage.body.summary.downloadedChapters).toBe(1);
    expect(usage.body.manga[0]).toMatchObject({
      downloadedChapterCount: 1,
      totalBytes: expect.any(Number),
    });
    expect(usage.body.manga[0].totalBytes).toBeGreaterThan(0);

    const deleted = await request(app)
      .delete(`/api/manga/${MANGA_ID}/downloads`)
      .set(bearer())
      .expect(200);
    expect(deleted.body).toMatchObject({
      deletedCount: 1,
      failedCount: 0,
    });

    await expect(storage.getChapterSize(MANGA_ID, "1")).resolves.toBe(0);
    const afterDelete = await db.query.chapters.findFirst({
      where: eq(chapters.id, CHAPTER_ROW_ID),
    });
    expect(afterDelete).toMatchObject({
      importStatus: "pending",
      importProgress: 0,
      pagesCount: 0,
    });
  });

  it("cleans up a failed download and leaves the chapter retryable", async () => {
    source = createSource({ failAfter: 1 });
    (global as any).pluginManager = { getSource: () => source };

    await request(app).get(pagesUrl()).set(bearer()).expect(500);

    const failed = await db.query.chapters.findFirst({
      where: eq(chapters.id, CHAPTER_ROW_ID),
    });
    expect(failed).toMatchObject({
      pagesCount: 0,
      importProgress: 0,
      importStatus: "error",
    });

    const storage = storageManager.getDefaultBackend();
    if (!storage) throw new Error("default backend missing");
    await expect(storage.getChapterSize(MANGA_ID, "1")).resolves.toBe(0);

    // The chapter is downloadable again: the retry overwrites the failed
    // attempt instead of serving a truncated set of pages.
    source = createSource();
    (global as any).pluginManager = { getSource: () => source };

    const retry = await request(app)
      .get(pagesUrl())
      .set(bearer())
      .expect(200);
    expect(retry.body).toHaveLength(2);

    const complete = await db.query.chapters.findFirst({
      where: eq(chapters.id, CHAPTER_ROW_ID),
    });
    expect(complete).toMatchObject({
      pagesCount: 2,
      importProgress: 100,
      importStatus: "complete",
    });
  });

  it("uses the source page count for archive chapters", async () => {
    source = createSource({ pageCount: 5, archive: true });
    (global as any).pluginManager = { getSource: () => source };

    const first = await request(app)
      .get(pagesUrl())
      .set(bearer())
      .expect(200);
    // The archive is stored as one file, but the response exposes every page.
    expect(first.body).toHaveLength(5);

    const chapter = await db.query.chapters.findFirst({
      where: eq(chapters.id, CHAPTER_ROW_ID),
    });
    expect(chapter).toMatchObject({
      pagesCount: 5,
      importProgress: 100,
      importStatus: "complete",
    });

    // Later reads expose every page of the archive.
    const second = await request(app)
      .get(pagesUrl())
      .set(bearer())
      .expect(200);
    expect(second.body).toHaveLength(5);
  });
});
