import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  closeDatabase,
  db,
  initDatabase,
  storageBackends,
} from "../src/database";
import { registerBuiltInPlugins } from "../src/plugins";
import { StorageManager } from "../src/storage";

let basePath: string;
let manager: StorageManager;

beforeAll(async () => {
  basePath = mkdtempSync(join(tmpdir(), "mugiwara-storage-manager-"));
  initDatabase();
  registerBuiltInPlugins();

  // Storage backends loaded from SQLite expose their JSON configuration as a
  // string. The local backend must still receive the configured base path.
  await db
    .update(storageBackends)
    .set({ config: JSON.stringify({ basePath }) })
    .where(eq(storageBackends.id, "local-default"));

  manager = new StorageManager(db);
  await manager.initialize();
});

afterAll(() => {
  rmSync(basePath, { recursive: true, force: true });
  closeDatabase();
});

describe("storage manager", () => {
  it("hydrates JSON-encoded backend config from the database", async () => {
    expect(manager.getDefaultBackendId()).toBe("local-default");
    const backend = manager.getDefaultBackend();
    expect(backend).toBeDefined();
    if (!backend) return;

    await backend.writeChapterPage(
      "manga",
      "1",
      1,
      Buffer.alloc(64),
      "image/jpeg",
    );

    expect(existsSync(join(basePath, "manga", "chapters", "1", "001.jpg"))).toBe(
      true,
    );
    await expect(backend.getChapterSize("manga", "1")).resolves.toBe(64);
  });
});
