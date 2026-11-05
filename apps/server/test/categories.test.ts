import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  categories,
  chapters,
  closeDatabase,
  db,
  initDatabase,
  manga,
  mangaCategories,
} from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";

const MANGA_ID = "category-test-manga";
const CHAPTER_ID = "category-test-chapter";

let app: ReturnType<typeof createApp>;
let token = "";

function bearer() {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  initDatabase();
  const auth = new AuthService(db);
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
  token = (await auth.createToken("categories test device", true)).token;

  await db.insert(manga).values({
    id: MANGA_ID,
    title: "Category Fixture",
    sourceId: "local",
    status: "ongoing",
    mediaType: "manga",
  });
  await db.insert(chapters).values({
    id: CHAPTER_ID,
    mangaId: MANGA_ID,
    chapterId: "1",
    pagesCount: 4,
    sortOrder: 1,
    importStatus: "complete",
  });
});

afterAll(() => {
  closeDatabase();
});

async function createCategory(name: string, color?: string) {
  const response = await request(app)
    .post("/api/categories")
    .set(bearer())
    .send({ name, color })
    .expect(201);
  return response.body as { id: string; name: string; sortOrder: number };
}

describe("category management API", () => {
  it("lists default categories with manga counts and sort order", async () => {
    const response = await request(app)
      .get("/api/categories")
      .set(bearer())
      .expect(200);

    expect(response.body.length).toBeGreaterThanOrEqual(5);
    const reading = response.body.find(
      (category: { name: string }) => category.name === "Reading",
    );
    expect(reading).toMatchObject({
      name: "Reading",
      color: "#22c55e",
      mangaCount: 0,
    });
    expect(typeof reading.sortOrder).toBe("number");

    const sortOrders = response.body.map(
      (category: { sortOrder: number }) => category.sortOrder,
    );
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
  });

  it("creates a category, trims its name and appends its sort order", async () => {
    const created = await createCategory("  Favorites  ", "#ff5500");

    expect(created.name).toBe("Favorites");
    expect(created.sortOrder).toBeGreaterThanOrEqual(5);

    const list = await request(app)
      .get("/api/categories")
      .set(bearer())
      .expect(200);
    const row = list.body.find(
      (category: { id: string }) => category.id === created.id,
    );
    expect(row).toMatchObject({ mangaCount: 0, color: "#ff5500" });
  });

  it("rejects empty and duplicate names on create", async () => {
    const empty = await request(app)
      .post("/api/categories")
      .set(bearer())
      .send({ name: "   " })
      .expect(400);
    expect(empty.body.error).toBe("Category name is required");

    const duplicate = await request(app)
      .post("/api/categories")
      .set(bearer())
      .send({ name: "reading" })
      .expect(409);
    expect(duplicate.body.error).toBe("Category with this name already exists");
  });

  it("renames, recolors and reorders a category", async () => {
    const created = await createCategory("Rename Me", "#123456");

    const updated = await request(app)
      .put(`/api/categories/${created.id}`)
      .set(bearer())
      .send({ name: "  Renamed  ", color: "#abcdef", sortOrder: 2 })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.id,
      name: "Renamed",
      color: "#abcdef",
      sortOrder: 2,
    });

    const list = await request(app)
      .get("/api/categories")
      .set(bearer())
      .expect(200);
    const position = list.body.findIndex(
      (category: { id: string }) => category.id === created.id,
    );
    expect(position).toBeGreaterThanOrEqual(0);
  });

  it("rejects empty names and case-insensitive duplicates on update", async () => {
    const created = await createCategory("Update Validation");

    const empty = await request(app)
      .put(`/api/categories/${created.id}`)
      .set(bearer())
      .send({ name: "  " })
      .expect(400);
    expect(empty.body.error).toBe("Category name is required");

    const duplicate = await request(app)
      .put(`/api/categories/${created.id}`)
      .set(bearer())
      .send({ name: "READING" })
      .expect(409);
    expect(duplicate.body.error).toBe("Category with this name already exists");

    // Renaming a category to its own name is still allowed.
    await request(app)
      .put(`/api/categories/${created.id}`)
      .set(bearer())
      .send({ name: "Update Validation" })
      .expect(200);

    const missing = await request(app)
      .put("/api/categories/does-not-exist")
      .set(bearer())
      .send({ name: "Nope" })
      .expect(404);
    expect(missing.body.error).toBe("Category not found");
  });

  it("assigns and unassigns manga without touching category data", async () => {
    const category = await createCategory("Assignments");

    await request(app)
      .post(`/api/categories/manga/${MANGA_ID}/categories`)
      .set(bearer())
      .send({ categoryId: category.id })
      .expect(201);

    const list = await request(app)
      .get("/api/categories")
      .set(bearer())
      .expect(200);
    expect(
      list.body.find((row: { id: string }) => row.id === category.id)
        ?.mangaCount,
    ).toBe(1);

    const mangaCategoriesResponse = await request(app)
      .get(`/api/categories/manga/${MANGA_ID}/categories`)
      .set(bearer())
      .expect(200);
    expect(
      mangaCategoriesResponse.body.map((row: { id: string }) => row.id),
    ).toContain(category.id);

    // Re-adding the same pair is a conflict rather than a duplicate row.
    await request(app)
      .post(`/api/categories/manga/${MANGA_ID}/categories`)
      .set(bearer())
      .send({ categoryId: category.id })
      .expect(409);

    await request(app)
      .delete(`/api/categories/manga/${MANGA_ID}/categories/${category.id}`)
      .set(bearer())
      .expect(204);

    const after = await request(app)
      .get("/api/categories")
      .set(bearer())
      .expect(200);
    expect(
      after.body.find((row: { id: string }) => row.id === category.id)
        ?.mangaCount,
    ).toBe(0);
  });

  it("deleting a category removes assignments but keeps manga and chapters", async () => {
    const category = await createCategory("Temporary");

    await request(app)
      .post(`/api/categories/manga/${MANGA_ID}/categories`)
      .set(bearer())
      .send({ categoryId: category.id })
      .expect(201);

    await request(app)
      .delete(`/api/categories/${category.id}`)
      .set(bearer())
      .expect(204);

    const deletedCategory = await db.query.categories.findFirst({
      where: eq(categories.id, category.id),
    });
    expect(deletedCategory).toBeUndefined();

    const assignments = await db.query.mangaCategories.findMany({
      where: eq(mangaCategories.categoryId, category.id),
    });
    expect(assignments).toHaveLength(0);

    const mangaRow = await db.query.manga.findFirst({
      where: eq(manga.id, MANGA_ID),
    });
    expect(mangaRow).toBeDefined();

    const chapterRows = await db.query.chapters.findMany({
      where: eq(chapters.mangaId, MANGA_ID),
    });
    expect(chapterRows).toHaveLength(1);
    expect(chapterRows[0]?.id).toBe(CHAPTER_ID);
  });

  it("keeps filter options in sync after a category is deleted", async () => {
    const category = await createCategory("Filter Sync");

    await request(app)
      .post(`/api/categories/manga/${MANGA_ID}/categories`)
      .set(bearer())
      .send({ categoryId: category.id })
      .expect(201);

    const before = await request(app)
      .get("/api/library/filters/options")
      .set(bearer())
      .expect(200);
    expect(
      before.body.categories.map((row: { id: string }) => row.id),
    ).toContain(category.id);

    await request(app)
      .delete(`/api/categories/${category.id}`)
      .set(bearer())
      .expect(204);

    const after = await request(app)
      .get("/api/library/filters/options")
      .set(bearer())
      .expect(200);
    expect(
      after.body.categories.map((row: { id: string }) => row.id),
    ).not.toContain(category.id);
  });
});
