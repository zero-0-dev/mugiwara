import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import * as yauzl from "yauzl";
import * as yazl from "yazl";

/**
 * Re-encode downloaded chapter pages into a smaller, reader-compatible format.
 *
 * Compression is deliberately best-effort: if anything goes wrong (invalid
 * image, unsupported format, animation, output larger than the input) the
 * original bytes are returned so a download never fails because of it.
 */

const WEBP_CONTENT_TYPE = "image/webp";
const WEBP_QUALITY = 80;

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
]);

const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-cbz",
  "application/vnd.comicbook+zip",
]);

const loggedWarnings = new Set<string>();

function warnOnce(key: string, message: string, error?: unknown): void {
  if (loggedWarnings.has(key)) return;
  loggedWarnings.add(key);
  if (error === undefined) {
    console.warn(`[image-compression] ${message}`);
    return;
  }
  const detail = error instanceof Error ? error.message : String(error);
  console.warn(`[image-compression] ${message}: ${detail}`);
}

export interface CompressedPage {
  data: Buffer;
  contentType: string;
}

/** Detect an image content type from its magic bytes. */
export function detectImageContentType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function isZipBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

function isRarBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 7 && buffer.toString("ascii", 0, 6) === "Rar!\u001a\u0007"
  );
}

function isArchive(buffer: Buffer, contentType: string): boolean {
  return (
    ZIP_CONTENT_TYPES.has(contentType) ||
    contentType === "application/x-rar-compressed" ||
    isZipBuffer(buffer) ||
    isRarBuffer(buffer)
  );
}

function isZip(buffer: Buffer, contentType: string): boolean {
  return ZIP_CONTENT_TYPES.has(contentType) || isZipBuffer(buffer);
}

function contentTypeForExtension(fileName: string): string | null {
  switch (extname(fileName).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    default:
      return null;
  }
}

function replaceExtension(fileName: string, extension: string): string {
  const current = extname(fileName);
  return current
    ? `${fileName.slice(0, -current.length)}${extension}`
    : `${fileName}${extension}`;
}

/**
 * Re-encode a single image as WebP. Returns the original buffer when the
 * image is unsupported, animated, invalid, or when the result would not be
 * smaller.
 */
export async function compressImage(
  buffer: Buffer,
  contentType: string,
): Promise<CompressedPage> {
  const fallback: CompressedPage = { data: buffer, contentType };

  const effectiveType =
    contentType.startsWith("image/") && contentType !== "image/bmp"
      ? contentType
      : (detectImageContentType(buffer) ?? contentType);

  if (!effectiveType.startsWith("image/")) {
    return fallback;
  }

  try {
    const metadata = await sharp(buffer, { animated: true }).metadata();

    // Keep animated GIF/WebP pages untouched: re-encoding would flatten them.
    if ((metadata.pages ?? 1) > 1) {
      return fallback;
    }
    if (!metadata.width || !metadata.height) {
      return fallback;
    }

    // `rotate()` applies EXIF orientation and the default sharp pipeline strips
    // metadata, so the output has no EXIF/comments left behind.
    const output = await sharp(buffer)
      .rotate()
      .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 4 })
      .toBuffer();

    if (output.length >= buffer.length) {
      return fallback;
    }

    return { data: output, contentType: WEBP_CONTENT_TYPE };
  } catch (error) {
    warnOnce("image", "could not compress image; storing original", error);
    return fallback;
  }
}

function readZipEntry(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

function forEachZipEntry(
  buffer: Buffer,
  handler: (entry: yauzl.Entry, data: Buffer | null) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }

      let settled = false;
      const fail = (cause: unknown) => {
        if (settled) return;
        settled = true;
        try {
          zipfile.close();
        } catch {
          // Ignore close errors while propagating the real failure.
        }
        reject(cause);
      };

      zipfile.on("error", fail);
      zipfile.on("end", () => {
        if (settled) return;
        settled = true;
        resolve();
      });

      zipfile.on("entry", async (entry: yauzl.Entry) => {
        try {
          const isDirectory = entry.fileName.endsWith("/");
          const data = isDirectory ? null : await readZipEntry(zipfile, entry);
          await handler(entry, data);
          if (!settled) zipfile.readEntry();
        } catch (cause) {
          fail(cause);
        }
      });

      zipfile.readEntry();
    });
  });
}

/**
 * Recompress the image entries of a ZIP/CBZ archive while preserving entry
 * order, non-image entries, and page count. Falls back to the original archive
 * when it cannot be decoded or when the result is not smaller.
 */
export async function compressArchive(
  buffer: Buffer,
  contentType: string,
): Promise<CompressedPage> {
  const fallback: CompressedPage = { data: buffer, contentType };
  const directory = await mkdtemp(join(tmpdir(), "mugiwara-archive-"));
  const outputPath = join(directory, "chapter.zip");

  let outputStream: ReturnType<typeof createWriteStream> | null = null;
  let zip: yazl.ZipFile | null = null;
  let written: Promise<void> | null = null;

  try {
    zip = new yazl.ZipFile();
    outputStream = createWriteStream(outputPath);
    written = pipeline(zip.outputStream, outputStream);

    let imageCount = 0;
    let compressedCount = 0;
    const usedNames = new Set<string>();

    await forEachZipEntry(buffer, async (entry, data) => {
      if (data === null) {
        zip!.addEmptyDirectory(entry.fileName);
        return;
      }

      const imageType = contentTypeForExtension(entry.fileName);
      if (
        imageType &&
        IMAGE_EXTENSIONS.has(extname(entry.fileName).toLowerCase())
      ) {
        imageCount++;
        const compressed = await compressImage(data, imageType);

        if (compressed.data !== data) {
          compressedCount++;
          let name = replaceExtension(entry.fileName, ".webp");
          let suffix = 1;
          while (usedNames.has(name)) {
            name = replaceExtension(
              entry.fileName,
              suffix === 1 ? ".webp" : `-${suffix}.webp`,
            );
            suffix++;
          }
          usedNames.add(name);
          zip!.addBuffer(compressed.data, name, {
            mtime: entry.getLastModDate(),
          });
          return;
        }
      }

      usedNames.add(entry.fileName);
      zip!.addBuffer(data, entry.fileName, {
        mtime: entry.getLastModDate(),
      });
    });

    // Leave archives without images (or effectively unchanged archives) as
    // they were; repacking only adds overhead.
    if (imageCount === 0 || compressedCount === 0) {
      zip.end();
      await written.catch(() => undefined);
      return fallback;
    }

    zip.end();
    await written;

    const output = await readFile(outputPath);
    if (output.length >= buffer.length) {
      return fallback;
    }

    return {
      data: output,
      contentType: isZip(buffer, contentType) ? "application/zip" : contentType,
    };
  } catch (error) {
    warnOnce(
      "archive",
      "could not recompress archive; storing original",
      error,
    );
    // Make sure the output stream and zip writer do not keep the process busy.
    try {
      zip?.end();
    } catch {
      // Ignore.
    }
    try {
      outputStream?.destroy();
    } catch {
      // Ignore.
    }
    await written?.catch(() => undefined);
    return fallback;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

/**
 * Compress a downloaded page if compression is enabled. Handles both single
 * images and ZIP/CBZ archives transparently for every storage backend.
 */
export async function maybeCompressPageData(
  data: Buffer,
  contentType: string,
  enabled: boolean,
): Promise<CompressedPage> {
  if (!enabled) {
    return { data, contentType };
  }

  const normalizedType = contentType || detectImageContentType(data) || "";

  try {
    if (isArchive(data, normalizedType)) {
      if (!isZip(data, normalizedType)) {
        // CBR/RAR extraction is not supported by the current dependencies.
        warnOnce(
          "rar",
          "rar archive compression is not supported; storing original",
        );
        return { data, contentType };
      }
      return await compressArchive(data, normalizedType);
    }

    if (
      normalizedType.startsWith("image/") ||
      detectImageContentType(data) !== null
    ) {
      return await compressImage(data, normalizedType);
    }
  } catch (error) {
    warnOnce(
      "unexpected",
      "compression failed unexpectedly; storing original",
      error,
    );
  }

  return { data, contentType };
}
