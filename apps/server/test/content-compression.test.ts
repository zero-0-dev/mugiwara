import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as yazl from "yazl";

import contentRoutes from "../src/api/content";
import {
  compressArchive,
  detectImageContentType,
} from "../src/services/image-compression";

let directory: string;
let archivePath: string;
let app: express.Express;

async function makePage(color: { r: number; g: number; b: number }) {
  return sharp({
    create: { width: 120, height: 180, channels: 3, background: color },
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

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mugiwara-content-test-"));
  archivePath = join(directory, "chapter.cbz");

  const archive = await makeArchive([
    { name: "001.jpg", data: await makePage({ r: 255, g: 0, b: 0 }) },
    { name: "002.jpg", data: await makePage({ r: 0, g: 0, b: 255 }) },
  ]);
  const compressed = await compressArchive(archive, "application/zip");
  await writeFile(archivePath, compressed.data);

  (global as any).storageManager = {
    getBackendForManga: async () => ({
      getPageFilePath: async () => archivePath,
    }),
  };

  app = express();
  app.use("/api/content", contentRoutes);
});

afterAll(async () => {
  delete (global as any).storageManager;
  await rm(directory, { recursive: true, force: true });
});

describe("compressed archive reader", () => {
  it("serves a recompressed archive page with the correct image content type", async () => {
    const response = await request(app)
      .get("/api/content/manga/manga-1/chapters/chapter-1/pages/2")
      .expect(200);

    expect(response.headers["content-type"]).toBe("image/webp");
    expect(detectImageContentType(response.body)).toBe("image/webp");
  });
});
