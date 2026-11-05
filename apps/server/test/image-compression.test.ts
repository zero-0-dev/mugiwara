import { describe, expect, it } from "vitest";
import sharp from "sharp";
import * as yauzl from "yauzl";
import * as yazl from "yazl";
import {
  compressArchive,
  compressImage,
  detectImageContentType,
  maybeCompressPageData,
} from "../src/services/image-compression";

async function makeImage(
  format: "jpeg" | "png" | "webp" | "gif",
  options: { width?: number; height?: number; alpha?: boolean } = {},
): Promise<Buffer> {
  const width = options.width ?? 128;
  const height = options.height ?? 96;
  let image = sharp({
    create: {
      width,
      height,
      channels: options.alpha ? 4 : 3,
      background: options.alpha
        ? { r: 200, g: 40, b: 80, alpha: 0.4 }
        : { r: 200, g: 40, b: 80, alpha: 1 },
    },
  });

  switch (format) {
    case "jpeg":
      return image.jpeg({ quality: 95 }).toBuffer();
    case "png":
      return image.png().toBuffer();
    case "webp":
      return image.webp({ quality: 95 }).toBuffer();
    case "gif":
      return image.gif().toBuffer();
  }
}

function zipEntries(
  entries: Array<{ name: string; data: Buffer }>,
): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    zip.addBuffer(entry.data, entry.name);
  }

  const chunks: Buffer[] = [];
  zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
  zip.end();
  return completed;
}

function readZipImageNames(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }

      const names: string[] = [];
      zipfile.on("entry", (entry) => {
        if (!entry.fileName.endsWith("/")) names.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on("end", () => resolve(names));
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  });
}

describe("compressImage", () => {
  it.each(["jpeg", "png", "webp", "gif"] as const)(
    "re-encodes %s input as readable WebP with unchanged dimensions",
    async (format) => {
      const input = await makeImage(format, { width: 160, height: 120 });
      const inputMeta = await sharp(input).metadata();
      const result = await compressImage(
        input,
        `image/${format === "jpeg" ? "jpeg" : format}`,
      );

      expect(result.contentType).toBe("image/webp");
      expect(result.data.length).toBeLessThan(input.length);

      const outputMeta = await sharp(result.data).metadata();
      expect(outputMeta.format).toBe("webp");
      expect(outputMeta.width).toBe(inputMeta.width);
      expect(outputMeta.height).toBe(inputMeta.height);
    },
  );

  it("keeps transparency for transparent PNG input", async () => {
    const input = await makeImage("png", { alpha: true });
    const result = await compressImage(input, "image/png");

    const meta = await sharp(result.data).metadata();
    expect(meta.hasAlpha).toBe(true);

    const { data } = await sharp(result.data)
      .ensureAlpha()
      .extractChannel("alpha")
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data.some((value) => value < 255)).toBe(true);
  });

  it("returns the original bytes when re-encoding would be larger", async () => {
    const input = await makeImage("gif", { width: 1, height: 1 });
    const result = await compressImage(input, "image/gif");

    expect(result.contentType).toBe("image/gif");
    expect(result.data).toBe(input);
  });

  it("returns the original bytes when the image is invalid", async () => {
    const invalid = Buffer.from("definitely not an image");
    const result = await compressImage(invalid, "image/jpeg");

    expect(result.contentType).toBe("image/jpeg");
    expect(result.data).toBe(invalid);
  });

  it("strips image metadata", async () => {
    const input = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 20, g: 80, b: 160 },
      },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "Copyright Tester" } } })
      .jpeg()
      .toBuffer();

    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await compressImage(input, "image/jpeg");
    expect((await sharp(result.data).metadata()).exif).toBeUndefined();
  });
});

describe("compressArchive", () => {
  it("recompresses image entries and preserves page order and count", async () => {
    const first = await makeImage("jpeg", { width: 200, height: 300 });
    const second = await makeImage("png", { width: 200, height: 300 });
    const third = await makeImage("jpeg", { width: 200, height: 300 });
    const input = await zipEntries([
      { name: "001.jpg", data: first },
      { name: "002.png", data: second },
      { name: "003.jpg", data: third },
    ]);

    const result = await compressArchive(input, "application/zip");

    expect(result.contentType).toBe("application/zip");
    expect(result.data.length).toBeLessThan(input.length);

    const names = await readZipImageNames(result.data);
    expect(names).toHaveLength(3);
    expect(names[0]).toMatch(/^001\./);
    expect(names[1]).toMatch(/^002\./);
    expect(names[2]).toMatch(/^003\./);
    expect(names.every((name) => name.endsWith(".webp"))).toBe(true);
  });

  it("keeps non-image entries and their position", async () => {
    const image = await makeImage("jpeg");
    const input = await zipEntries([
      { name: "ComicInfo.xml", data: Buffer.from("<xml />") },
      { name: "001.jpg", data: image },
    ]);

    const result = await compressArchive(input, "application/zip");
    const names = await readZipImageNames(result.data);

    expect(names).toEqual(["ComicInfo.xml", "001.webp"]);
  });

  it("falls back to the original archive when it is not a valid ZIP", async () => {
    const invalid = Buffer.from("PK\u0003\u0004not really a zip");
    const result = await compressArchive(invalid, "application/zip");

    expect(result.data).toBe(invalid);
    expect(result.contentType).toBe("application/zip");
  });
});

describe("maybeCompressPageData", () => {
  it("returns bytes untouched when compression is disabled", async () => {
    const input = await makeImage("jpeg");
    const result = await maybeCompressPageData(input, "image/jpeg", false);

    expect(result.data).toBe(input);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("does not touch unsupported content such as CBR/RAR archives", async () => {
    const rar = Buffer.from("Rar!\u001a\u0007\u0000rest of archive");
    const result = await maybeCompressPageData(
      rar,
      "application/x-rar-compressed",
      true,
    );

    expect(result.data).toBe(rar);
    expect(result.contentType).toBe("application/x-rar-compressed");
  });

  it("detects images from magic bytes when the content type is missing", async () => {
    const input = await makeImage("png");
    const result = await maybeCompressPageData(input, "", true);

    expect(result.contentType).toBe("image/webp");
    expect(detectImageContentType(result.data)).toBe("image/webp");
  });
});
