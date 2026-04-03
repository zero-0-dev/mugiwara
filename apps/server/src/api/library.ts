import { Router, Request, Response } from "express";
import {
  getLibraryDirectories,
  setLibraryDirectories,
} from "../services/settings";
import { scanLibrary } from "../services/library-scan";
import type { LocalFileSource } from "../plugins";

const router: Router = Router();

// POST /api/library/scan - Scan all configured sources
router.post("/scan", async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = await scanLibrary();
    res.json(results);
  } catch (error) {
    console.error("Error scanning library:", error);
    res.status(500).json({ error: "Failed to scan library" });
  }
});

// POST /api/library/sources/local/configure - Configure local source
router.post(
  "/sources/local/configure",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { directories } = req.body;

      if (!Array.isArray(directories)) {
        res.status(400).json({ error: "directories must be an array" });
        return;
      }

      // Save to settings file
      await setLibraryDirectories(directories);

      const { pluginManager } = await import("../plugins");
      const localSource = pluginManager.getSource("local") as LocalFileSource;
      if (localSource) {
        localSource.setDirectories(directories);
      }

      res.json({ success: true, directories });
    } catch (error) {
      console.error("Error configuring local source:", error);
      res.status(500).json({ error: "Failed to configure local source" });
    }
  },
);

// GET /api/library/sources/local/configure - Get configured directories
router.get(
  "/sources/local/configure",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const directories = await getLibraryDirectories();
      res.json({ directories });
    } catch (error) {
      console.error("Error loading local source config:", error);
      res.status(500).json({ error: "Failed to load configuration" });
    }
  },
);

// GET /api/library/search - Search manga
router.get("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      res.status(400).json({ error: "Query parameter q is required" });
      return;
    }

    const { mangaRepository } = await import("../database");
    const results = await mangaRepository.search(q);
    res.json(results);
  } catch (error) {
    console.error("Error searching manga:", error);
    res.status(500).json({ error: "Failed to search manga" });
  }
});

export default router;
