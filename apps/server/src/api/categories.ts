import { Router, Request, Response } from "express";
import { db, categories, mangaCategories } from "../database";
import { eq, asc, desc, and, ne, count, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const router: Router = Router();

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Category names are unique without regard to case so the UI can reject
 * "Reading" when "reading" already exists. The database unique index remains
 * the final guard.
 */
async function findCategoryByName(
  name: string,
  excludeId?: string,
): Promise<{ id: string } | undefined> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      excludeId
        ? and(
            sql`lower(${categories.name}) = lower(${name})`,
            ne(categories.id, excludeId),
          )
        : sql`lower(${categories.name}) = lower(${name})`,
    )
    .limit(1);

  return existing;
}

// GET /api/categories - Get all categories with their manga counts
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [allCategories, countRows] = await Promise.all([
      db.query.categories.findMany({
        orderBy: asc(categories.sortOrder),
      }),
      db
        .select({
          categoryId: mangaCategories.categoryId,
          mangaCount: count(),
        })
        .from(mangaCategories)
        .groupBy(mangaCategories.categoryId),
    ]);

    const counts = new Map(
      countRows.map((row) => [row.categoryId, row.mangaCount]),
    );

    res.json(
      allCategories.map((category) => ({
        ...category,
        mangaCount: counts.get(category.id) ?? 0,
      })),
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// POST /api/categories - Create a new category
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color } = req.body;
    const trimmedName = normalizeName(name);

    if (trimmedName.length === 0) {
      res.status(400).json({ error: "Category name is required" });
      return;
    }

    // Check for duplicate name
    const existing = await findCategoryByName(trimmedName);

    if (existing) {
      res.status(409).json({ error: "Category with this name already exists" });
      return;
    }

    // Get max sort order
    const lastCategory = await db.query.categories.findFirst({
      orderBy: desc(categories.sortOrder),
    });
    const sortOrder = lastCategory ? lastCategory.sortOrder + 1 : 0;

    const newCategory = await db
      .insert(categories)
      .values({
        id: uuidv4(),
        name: trimmedName,
        color: color || null,
        sortOrder,
      })
      .returning();

    res.status(201).json(newCategory[0]);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// PUT /api/categories/:id - Update a category
router.put("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, color, sortOrder } = req.body;

    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    // Check if category exists
    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });

    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    if (
      sortOrder !== undefined &&
      (!Number.isInteger(sortOrder) || sortOrder < 0)
    ) {
      res
        .status(400)
        .json({ error: "Sort order must be a non-negative integer" });
      return;
    }

    const updates: Partial<typeof categories.$inferInsert> = {};

    if (name !== undefined) {
      const trimmedName = normalizeName(name);
      if (trimmedName.length === 0) {
        res.status(400).json({ error: "Category name is required" });
        return;
      }

      // Check for duplicates, ignoring the category being renamed.
      const duplicate = await findCategoryByName(trimmedName, id);
      if (duplicate) {
        res
          .status(409)
          .json({ error: "Category with this name already exists" });
        return;
      }

      updates.name = trimmedName;
    }

    if (color !== undefined) updates.color = color || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const updated = await db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
});

// DELETE /api/categories/:id - Delete a category
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    // Check if category exists
    const existing = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });

    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    await db.delete(categories).where(eq(categories.id, id));

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

// GET /api/categories/:id/manga - Get all manga in a category
router.get("/:id/manga", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: "Category ID is required" });
      return;
    }

    // Check if category exists
    const category = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    const mangaInCategory = await db.query.mangaCategories.findMany({
      where: eq(mangaCategories.categoryId, id),
      with: {
        manga: true,
      },
    });

    res.json(mangaInCategory.map((mc) => mc.manga));
  } catch (error) {
    console.error("Error fetching manga in category:", error);
    res.status(500).json({ error: "Failed to fetch manga in category" });
  }
});

// POST /api/manga/:mangaId/categories - Add manga to category
router.post(
  "/manga/:mangaId/categories",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { mangaId } = req.params;
      const { categoryId } = req.body;

      if (!mangaId) {
        res.status(400).json({ error: "Manga ID is required" });
        return;
      }

      if (!categoryId) {
        res.status(400).json({ error: "categoryId is required" });
        return;
      }

      // Check if already assigned
      const existing = await db.query.mangaCategories.findFirst({
        where: and(
          eq(mangaCategories.mangaId, mangaId),
          eq(mangaCategories.categoryId, categoryId),
        ),
      });

      if (existing) {
        res.status(409).json({ error: "Manga already in this category" });
        return;
      }

      await db.insert(mangaCategories).values({
        mangaId,
        categoryId,
      });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error adding manga to category:", error);
      res.status(500).json({ error: "Failed to add manga to category" });
    }
  },
);

// DELETE /api/manga/:mangaId/categories/:categoryId - Remove manga from category
router.delete(
  "/manga/:mangaId/categories/:categoryId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { mangaId, categoryId } = req.params;

      if (!mangaId || !categoryId) {
        res
          .status(400)
          .json({ error: "Manga ID and Category ID are required" });
        return;
      }

      await db
        .delete(mangaCategories)
        .where(
          and(
            eq(mangaCategories.mangaId, mangaId),
            eq(mangaCategories.categoryId, categoryId),
          ),
        );

      res.status(204).send();
    } catch (error) {
      console.error("Error removing manga from category:", error);
      res.status(500).json({ error: "Failed to remove manga from category" });
    }
  },
);

// GET /api/manga/:mangaId/categories - Get categories for a manga
router.get(
  "/manga/:mangaId/categories",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { mangaId } = req.params;

      if (!mangaId) {
        res.status(400).json({ error: "Manga ID is required" });
        return;
      }

      const mangaCats = await db.query.mangaCategories.findMany({
        where: eq(mangaCategories.mangaId, mangaId),
        with: {
          category: true,
        },
      });

      res.json(mangaCats.map((mc) => mc.category));
    } catch (error) {
      console.error("Error fetching manga categories:", error);
      res.status(500).json({ error: "Failed to fetch manga categories" });
    }
  },
);

export default router;
