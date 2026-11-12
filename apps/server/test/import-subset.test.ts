import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import * as yazl from "yazl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PageData, SourceChapter } from "@mugiwara-manga/plugin-api";

import {
  chapters,
  closeDatabase,
  db,
  initDatabase,
  manga,
  storageBackends,
} from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";
import { registerBuiltInPlugins } from "../src/plugins";
import { ImportQueueProcessor, ImportTaskRepository } from "../src/queue";
import { StorageManager } from "../src/storage";

const MANGA_ID = "import-subset-manga";
const SOURCE_ID = "fake-source";

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

function sourceChapter(chapterId: string, pageCount?: number): SourceChapter {
  return {
    sourceChapterId: `source-${chapterId}`,
    chapterId,
    title: `Chapter ${chapterId}`,
    sortOrder: Number(chapterId),
    pageCount,
  };
}

let app: ReturnType<typeof createApp>;
let auth: AuthService;
let storageManager: StorageManager;
let basePath: string;
let token: string;

function bearer() {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  basePath = mkdtempSync(join(tmpdir(), "mugiwara-import-subset-"));
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
  token = (await auth.createToken("import subset test", true)).token;
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
});

afterAll(async () => {
  await storageManager.getDefaultBackend()?.deleteChapter(MANGA_ID, "1");
  delete (global as any).storageManager;
  delete (global as any).taskRepository;
  delete (global as any).pluginManager;
  closeDatabase();
  rmSync(basePath, { recursive: true, force: true });
});

describe("importing a chapter subset", () => {
  it("does not mark unselected chapters as downloaded", async () => {
    await db.insert(manga).values({
      id: MANGA_ID,
      title: "Subset Manga",
      sourceId: SOURCE_ID,
      sourceMangaId: "source-manga",
      storageBackendId: "local-default",
    });

    const details = {
      sourceMangaId: "source-manga",
      title: "Subset Manga",
      chapters: [sourceChapter("1", 7), sourceChapter("2", 7), sourceChapter("3", 7)],
    };

    (global as any).pluginManager = {
      getSource: () => ({
        getMangaDetails: async () => details,
        async *downloadChapter(): AsyncGenerator<PageData, void, unknown> {
          yield { pageNumber: 1, data: Buffer.from("page"), contentType: "image/jpeg" };
        },
      }),
    };

    const response = await request(app)
      .post("/api/library/import")
      .set(bearer())
      .send({
        sourceId: SOURCE_ID,
        sourceMangaId: "source-manga",
        chapters: [sourceChapter("1", 7)],
      })
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      mangaId: MANGA_ID,
      chaptersAdded: 3,
      chaptersQueued: 1,
    });

    const rows = await db.query.chapters.findMany({
      where: eq(chapters.mangaId, MANGA_ID),
    });
    expect(rows).toHaveLength(3);

    for (const row of rows) {
      // No chapter has stored pages yet, so none of them may look downloaded.
      expect(row.pagesCount).toBe(0);
      // The source count is kept for progress and archive completion.
      expect(row.sourcePagesCount).toBe(7);
      expect(row.importStatus).toBe("pending");
    }

    const tasks = await (global as any).taskRepository.getByManga(MANGA_ID);
    expect(tasks.map((task: { chapterId: string }) => task.chapterId)).toEqual([
      "1",
    ]);

    // The import progress must only describe the selected chapter; otherwise
    // the dialog would wait forever for chapters that were never queued.
    const progress = await request(app)
      .get(`/api/library/import/${MANGA_ID}/progress`)
      .set(bearer())
      .expect(200);
    expect(progress.body).toMatchObject({
      totalChapters: 1,
      completedChapters: 0,
      queuedChapters: 1,
      isComplete: false,
    });
    expect(
      progress.body.chapters.map((chapter: { chapterId: string }) => chapter.chapterId),
    ).toEqual(["1"]);

    // Cancelling the import must only touch the queued chapter, not the
    // unselected ones that were created for later.
    const cancelled = await request(app)
      .post(`/api/library/import/${MANGA_ID}/cancel`)
      .set(bearer())
      .expect(200);
    expect(cancelled.body).toMatchObject({
      cancelledChapters: 1,
      cancelledTasks: 1,
    });

    const afterCancel = await db.query.chapters.findMany({
      where: eq(chapters.mangaId, MANGA_ID),
    });
    expect(
      afterCancel.map((row) => [row.chapterId, row.importStatus]),
    ).toEqual([
      ["1", "cancelled"],
      ["2", "pending"],
      ["3", "pending"],
    ]);

    await db
      .update(chapters)
      .set({ importStatus: "complete", importProgress: 100, pagesCount: 7 })
      .where(and(eq(chapters.mangaId, MANGA_ID), eq(chapters.chapterId, "1")));

    const finished = await request(app)
      .get(`/api/library/import/${MANGA_ID}/progress`)
      .set(bearer())
      .expect(200);
    expect(finished.body).toMatchObject({
      totalChapters: 1,
      completedChapters: 1,
      isComplete: true,
      overallProgress: 100,
    });
  });
});

describe("queued archive downloads", () => {
  it("stores the source page count when the archive finishes", async () => {
    await db.delete(chapters);
    await db.delete(manga);

    await db.insert(manga).values({
      id: MANGA_ID,
      title: "Archive Manga",
      sourceId: SOURCE_ID,
      sourceMangaId: "source-manga",
      storageBackendId: "local-default",
    });
    await db.insert(chapters).values({
      id: "archive-chapter-row",
      mangaId: MANGA_ID,
      chapterId: "1",
      title: "Chapter 1",
      pagesCount: 0,
      sourcePagesCount: 4,
      sortOrder: 1,
      importStatus: "pending",
    });

    const archive = await makeArchive([
      { name: "001.txt", data: Buffer.from("one") },
      { name: "002.txt", data: Buffer.from("two") },
      { name: "003.txt", data: Buffer.from("three") },
      { name: "004.txt", data: Buffer.from("four") },
    ]);

    (global as any).pluginManager = {
      getSource: () => ({
        getMangaDetails: async () => ({
          sourceMangaId: "source-manga",
          title: "Archive Manga",
          chapters: [sourceChapter("1", 4)],
        }),
        async *downloadChapter(): AsyncGenerator<PageData, void, unknown> {
          yield {
            pageNumber: 1,
            data: archive,
            contentType: "application/zip",
          };
        },
      }),
    };

    const repository = (global as any).taskRepository as ImportTaskRepository;
    await repository.create({
      type: "chapter",
      mangaId: MANGA_ID,
      chapterId: "1",
      sortOrder: 1,
      sourceId: SOURCE_ID,
      sourceChapterId: "source-1",
    });

    const processor = new ImportQueueProcessor({
      repository,
      concurrency: 1,
      pollInterval: 10,
    });

    await new Promise<void>((resolve, reject) => {
      processor.once("taskComplete", () => resolve());
      processor.once("taskError", (_task, error) => reject(error));
      void processor.start();
    });
    processor.stop();

    const row = await db.query.chapters.findFirst({
      where: eq(chapters.id, "archive-chapter-row"),
    });
    expect(row).toMatchObject({
      // An archive is stored as a single file but exposes every source page.
      pagesCount: 4,
      sourcePagesCount: 4,
      importProgress: 100,
      importStatus: "complete",
    });
  });
});
