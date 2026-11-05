import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

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

const MANGA_ID = "usage-api-manga";

let app: ReturnType<typeof createApp>;
let auth: AuthService;
let storageManager: StorageManager;
let basePath: string;
let token: string;

function bearer() {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  basePath = mkdtempSync(join(tmpdir(), "mugiwara-usage-api-"));
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
  token = (await auth.createToken("usage api test", true)).token;
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
});

beforeEach(async () => {
  await db.delete(readingProgress);
  await db.delete(chapters);
  await db.delete(manga);

  await db.insert(manga).values({
    id: MANGA_ID,
    title: "Usage API Manga",
    sourceId: "local",
    storageBackendId: "local-default",
  });
  await db.insert(chapters).values([
    {
      id: "usage-api-chapter-1",
      mangaId: MANGA_ID,
      chapterId: "1",
      title: "One",
      pagesCount: 2,
      sortOrder: 1,
      importStatus: "complete",
    },
    {
      id: "usage-api-chapter-2",
      mangaId: MANGA_ID,
      chapterId: "2",
      title: "Two",
      pagesCount: 0,
      sortOrder: 2,
      importStatus: "pending",
    },
  ]);
  await db.insert(readingProgress).values({
    id: "usage-api-progress",
    mangaId: MANGA_ID,
    chapterId: "usage-api-chapter-1",
    pageNumber: 1,
    totalPages: 2,
    deviceId: "test-device",
    lastReadAt: "2025-01-02T03:04:05.000Z",
  });

  const backend = storageManager.getDefaultBackend();
  if (!backend) throw new Error("default backend missing");
  await backend.writeChapterPage(
    MANGA_ID,
    "1",
    1,
    Buffer.alloc(120),
    "image/jpeg",
  );
  await backend.writeChapterPage(
    MANGA_ID,
    "1",
    2,
    Buffer.alloc(80),
    "image/jpeg",
  );
});

afterAll(() => {
  rmSync(basePath, { recursive: true, force: true });
  closeDatabase();
});

describe("storage usage API", () => {
  it("requires authentication", async () => {
    await request(app).get("/api/storage/usage").expect(401);
    await request(app).delete(`/api/manga/${MANGA_ID}/downloads`).expect(401);
    await request(app)
      .delete(`/api/manga/${MANGA_ID}/chapters/1/download`)
      .expect(401);
  });

  it("returns per-manga usage with size and last-read sorting", async () => {
    const response = await request(app)
      .get("/api/storage/usage?sort=size&order=desc")
      .set(bearer())
      .expect(200);

    expect(response.body.summary).toEqual({
      totalBytes: 200,
      mangaWithDownloads: 1,
      downloadedChapters: 1,
    });
    expect(response.body.manga).toEqual([
      expect.objectContaining({
        mangaId: MANGA_ID,
        title: "Usage API Manga",
        storageBackendId: "local-default",
        downloadedChapterCount: 1,
        totalBytes: 200,
        lastReadAt: "2025-01-02T03:04:05.000Z",
      }),
    ]);

    const ascending = await request(app)
      .get("/api/storage/usage?sort=lastRead&order=asc")
      .set(bearer())
      .expect(200);
    expect(ascending.body.manga[0].mangaId).toBe(MANGA_ID);
  });

  it("deletes every downloaded chapter, resets state and keeps progress", async () => {
    const response = await request(app)
      .delete(`/api/manga/${MANGA_ID}/downloads`)
      .set(bearer())
      .expect(200);

    expect(response.body).toMatchObject({
      mangaId: MANGA_ID,
      deletedCount: 1,
      failedCount: 0,
      bytesFreed: 200,
    });
    expect(response.body.results[0]).toMatchObject({
      chapterId: "1",
      success: true,
    });

    const chapterRows = await db.query.chapters.findMany({
      where: eq(chapters.mangaId, MANGA_ID),
    });
    expect(chapterRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chapterId: "1",
          importStatus: "pending",
          importProgress: 0,
          pagesCount: 0,
          title: "One",
        }),
        expect.objectContaining({
          chapterId: "2",
          importStatus: "pending",
        }),
      ]),
    );

    const progress = await request(app)
      .get(`/api/manga/${MANGA_ID}/progress/all`)
      .set(bearer())
      .expect(200);
    expect(progress.body).toHaveLength(1);
    expect(progress.body[0]).toMatchObject({
      chapterId: "usage-api-chapter-1",
      lastReadAt: "2025-01-02T03:04:05.000Z",
    });

    // A second delete finds nothing to remove and still succeeds.
    const second = await request(app)
      .delete(`/api/manga/${MANGA_ID}/downloads`)
      .set(bearer())
      .expect(200);
    expect(second.body).toMatchObject({
      deletedCount: 0,
      failedCount: 0,
      bytesFreed: 0,
    });

    const usage = await request(app)
      .get("/api/storage/usage")
      .set(bearer())
      .expect(200);
    expect(usage.body.summary.totalBytes).toBe(0);
    expect(usage.body.manga[0].downloadedChapterCount).toBe(0);
  });

  it("deletes a single chapter download and reports unknown chapters", async () => {
    const response = await request(app)
      .delete(`/api/manga/${MANGA_ID}/chapters/1/download`)
      .set(bearer())
      .expect(200);

    expect(response.body).toMatchObject({
      chapterId: "1",
      success: true,
      bytesFreed: 200,
    });

    const deleted = await db.query.chapters.findFirst({
      where: eq(chapters.id, "usage-api-chapter-1"),
    });
    expect(deleted).toMatchObject({
      importStatus: "pending",
      importProgress: 0,
      pagesCount: 0,
    });

    await request(app)
      .delete(`/api/manga/${MANGA_ID}/chapters/missing/download`)
      .set(bearer())
      .expect(404);
  });
});
