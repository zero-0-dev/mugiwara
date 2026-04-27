import { Router, Request, Response } from "express";
import { anilistService } from "../services/anilist";

const router: Router = Router();

router.get("/browse", async (req: Request, res: Response) => {
  try {
    const {
      sort,
      genre,
      format,
      status,
      country,
      search,
      page,
      perPage,
    } = req.query;

    const sortArray = sort
      ? String(sort).split(",")
      : ["TRENDING_DESC"];

    const result = await anilistService.browseManga({
      sort: sortArray,
      genre: genre ? String(genre) : undefined,
      format: format ? String(format) : undefined,
      status: status ? String(status) : undefined,
      countryOfOrigin: country ? String(country) : undefined,
      search: search ? String(search) : undefined,
      page: page ? parseInt(String(page), 10) : 1,
      perPage: perPage ? parseInt(String(perPage), 10) : 20,
    });

    res.json(result);
  } catch (error) {
    console.error("Error browsing discover:", error);
    res.status(500).json({ error: "Failed to browse manga" });
  }
});

router.get("/manga/:anilistId", async (req: Request, res: Response) => {
  try {
    const anilistId = parseInt(req.params.anilistId ?? "", 10);
    if (isNaN(anilistId)) {
      res.status(400).json({ error: "Invalid anilistId" });
      return;
    }

    const manga = await anilistService.getMangaById(anilistId);
    if (!manga) {
      res.status(404).json({ error: "Manga not found" });
      return;
    }

    res.json(manga);
  } catch (error) {
    console.error("Error fetching discover manga:", error);
    res.status(500).json({ error: "Failed to fetch manga" });
  }
});

export default router;
