import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Must be set before the server modules are imported: the SQLite singleton is
// created at import time. Each test worker gets an isolated data directory.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "mugiwara-test-"));
process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
