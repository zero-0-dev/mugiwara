import { Router, Request, Response } from "express";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import * as yauzl from "yauzl";
import { basename, join, resolve, sep } from "path";
import { detectImageContentType } from "../services/image-compression";

const router: Router = Router();
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

// GET /api/content/manga/:mangaId/chapters/:chapterId/pages/:pageNumber - Serve chapter page
router.get(
  "/manga/:mangaId/chapters/:chapterId/pages/:pageNumber",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const mangaId = req.params.mangaId;
      const chapterId = req.params.chapterId;
      const pageNumber = req.params.pageNumber;

      if (!mangaId || !chapterId || !pageNumber) {
        res.status(400).json({ error: "Missing required parameters" });
        return;
      }

      if (!global.storageManager) {
        res.status(500).json({ error: "Storage manager not initialized" });
        return;
      }

      // Get the storage backend for this manga
      const storage = await global.storageManager.getBackendForManga(mangaId);

      // Get the file path for the page
      const filePath = await (storage as any).getPageFilePath(
        mangaId,
        chapterId,
        parseInt(pageNumber),
      );

      if (!filePath || !existsSync(filePath)) {
        res.status(404).json({ error: "Page not found" });
        return;
      }

      // Check if it's an archive file
      if (filePath.endsWith(".cbz") || filePath.endsWith(".zip")) {
        // For CBZ/ZIP files, extract and serve the specific page (Nth image)
        const pageIndex = parseInt(pageNumber) - 1; // Convert to 0-based index
        const imageBuffer = await extractImageFromArchiveByIndex(
          filePath,
          pageIndex,
        );
        if (!imageBuffer) {
          res.status(404).json({ error: "Page not found in archive" });
          return;
        }

        res.setHeader(
          "Content-Type",
          detectImageContentType(imageBuffer) || "image/jpeg",
        );
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(imageBuffer);
      } else {
        // Regular image file
        const imageBuffer = await readFile(filePath);
        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        const contentTypeMap: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          gif: "image/gif",
        };
        const contentType = contentTypeMap[ext] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(imageBuffer);
      }
    } catch (error) {
      console.error("Error serving page:", error);
      res.status(500).json({ error: "Failed to serve page" });
    }
  },
);

// GET /api/content/local/chapter - Serve chapter page (legacy)
router.get(
  "/local/chapter",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { path, archive, file } = req.query;

      if (path && typeof path === "string") {
        // Legacy direct-file access. This intentionally accepts absolute paths
        // for authenticated users because local sources use it to preview the
        // folder being added before it is registered as a library directory.
        if (!existsSync(path)) {
          res.status(404).json({ error: "File not found" });
          return;
        }

        const imageBuffer = await readFile(path);
        const ext = path.split(".").pop()?.toLowerCase();
        const contentType =
          {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            gif: "image/gif",
          }[ext || ""] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(imageBuffer);
      } else if (
        archive &&
        file &&
        typeof archive === "string" &&
        typeof file === "string"
      ) {
        // Archive file access
        const safeFile = basename(file);
        if (safeFile !== file || safeFile.includes("..")) {
          res.status(403).json({ error: "Archive path is not allowed" });
          return;
        }
        if (!existsSync(archive)) {
          res.status(404).json({ error: "Archive not found" });
          return;
        }

        const imageBuffer = await extractFromArchive(archive, file);
        if (!imageBuffer) {
          res.status(404).json({ error: "File not found in archive" });
          return;
        }

        const ext = file.split(".").pop()?.toLowerCase();
        const contentType =
          {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            gif: "image/gif",
          }[ext || ""] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.send(imageBuffer);
      } else {
        res.status(400).json({ error: "Invalid parameters" });
      }
    } catch (error) {
      console.error("Error serving content:", error);
      res.status(500).json({ error: "Failed to serve content" });
    }
  },
);

// GET /api/thumbnails/:filename - Serve thumbnail
router.get(
  "/thumbnails/:filename",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filename = req.params.filename;
      if (!filename) {
        res.status(400).json({ error: "Filename is required" });
        return;
      }
      const thumbnailsDir = join(DATA_DIR, "thumbnails");
      const filepath = safeJoin(thumbnailsDir, filename);
      if (!filepath) {
        res.status(400).json({ error: "Invalid filename" });
        return;
      }

      if (!existsSync(filepath)) {
        res.status(404).json({ error: "Thumbnail not found" });
        return;
      }

      const imageBuffer = await readFile(filepath);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error serving thumbnail:", error);
      res.status(500).json({ error: "Failed to serve thumbnail" });
    }
  },
);

// GET /api/content/covers/:filename - Serve cover image
router.get(
  "/covers/:filename",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const filename = req.params.filename;
      if (!filename) {
        res.status(400).json({ error: "Filename is required" });
        return;
      }
      const coversDir = join(DATA_DIR, "covers");
      const filepath = safeJoin(coversDir, filename);
      if (!filepath) {
        res.status(400).json({ error: "Invalid filename" });
        return;
      }

      if (!existsSync(filepath)) {
        res.status(404).json({ error: "Cover image not found" });
        return;
      }

      const imageBuffer = await readFile(filepath);
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error serving cover image:", error);
      res.status(500).json({ error: "Failed to serve cover image" });
    }
  },
);

function safeJoin(baseDir: string, filename: string): string | null {
  if (!filename || basename(filename) !== filename) return null;
  const resolved = resolve(baseDir, filename);
  const prefix = resolve(baseDir) + sep;
  return resolved.startsWith(prefix) ? resolved : null;
}

function extractFromArchive(
  archivePath: string,
  fileName: string,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }

      zipfile.readEntry();
      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName === fileName) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }

            const chunks: Buffer[] = [];
            readStream.on("data", (chunk) => chunks.push(chunk));
            readStream.on("end", () => {
              zipfile.close();
              resolve(Buffer.concat(chunks));
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        resolve(null);
      });

      zipfile.on("error", reject);
    });
  });
}

function extractImageFromArchiveByIndex(
  archivePath: string,
  index: number,
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err);
        return;
      }

      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      let imageIndex = 0;

      zipfile.readEntry();
      zipfile.on("entry", (entry: yauzl.Entry) => {
        const ext = entry.fileName
          .toLowerCase()
          .slice(entry.fileName.lastIndexOf("."));
        if (imageExtensions.includes(ext)) {
          if (imageIndex === index) {
            // Found the image at the requested index
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                reject(err);
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on("data", (chunk) => chunks.push(chunk));
              readStream.on("end", () => {
                zipfile.close();
                resolve(Buffer.concat(chunks));
              });
            });
          } else {
            imageIndex++;
            zipfile.readEntry();
          }
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on("end", () => {
        resolve(null);
      });

      zipfile.on("error", reject);
    });
  });
}

export default router;
