import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "dotenv";

/**
 * Development convenience: load repo-root `.env` / `.env.local` before any
 * server module reads `process.env`. Packaged builds bake tracker credentials
 * in and deliberately do not load a working-directory `.env`.
 *
 * Real environment variables always win. `.env.local` overrides `.env`.
 */
function loadDevelopmentEnvironment(): void {
  if (process.env.NODE_ENV === "production") return;

  const shellKeys = new Set(Object.keys(process.env));
  const candidates = new Set<string>();
  const repoRoot = join(__dirname, "../../..");
  for (const directory of [repoRoot, process.cwd()]) {
    candidates.add(join(directory, ".env"));
    candidates.add(join(directory, ".env.local"));
  }

  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const parsed = parse(readFileSync(file, "utf8"));
      for (const [key, value] of Object.entries(parsed)) {
        if (!shellKeys.has(key)) process.env[key] = value;
      }
    } catch {
      // A malformed .env must not prevent the server from starting.
    }
  }
}

loadDevelopmentEnvironment();
