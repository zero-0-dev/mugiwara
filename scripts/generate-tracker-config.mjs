#!/usr/bin/env node
/**
 * Bakes tracker OAuth credentials into a packaged build.
 *
 * Release builds set the MUGIWARA_* values in CI, so the identifiers and the
 * AniList app secret are never committed to the repository. The generated JSON
 * lives in the build output (`dist/trackers/builtin-trackers.json`) and is
 * copied into the desktop/server artifacts. Runtime environment variables still
 * override it for development and custom builds.
 *
 * Usage: node scripts/generate-tracker-config.mjs [output-directory]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const outputDir = process.argv[2]
  ? resolve(process.argv[2])
  : join(ROOT, "apps", "server", "dist", "trackers");

function read(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const config = {
  anilistClientId: read("MUGIWARA_ANILIST_CLIENT_ID"),
  anilistClientSecret: read("MUGIWARA_ANILIST_CLIENT_SECRET"),
  anilistRedirectUri: read("MUGIWARA_ANILIST_REDIRECT_URI"),
  malClientId: read("MUGIWARA_MAL_CLIENT_ID"),
  malClientSecret: read("MUGIWARA_MAL_CLIENT_SECRET"),
  malRedirectUri: read("MUGIWARA_MAL_REDIRECT_URI"),
  malUserAgent: read("MUGIWARA_MAL_USER_AGENT"),
};

const baked = Object.fromEntries(
  Object.entries(config).filter(([, value]) => value !== undefined),
);

const outputPath = join(outputDir, "builtin-trackers.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(baked, null, 2)}\n`, {
  mode: 0o600,
});

const providers = [];
if (baked.anilistClientId) {
  providers.push(
    baked.anilistClientSecret ? "AniList (with app secret)" : "AniList",
  );
}
if (baked.malClientId) providers.push("MyAnimeList");
if (providers.length > 0) {
  console.log(`Baked tracker credentials: ${providers.join(", ")}`);
} else {
  console.log(
    "No tracker credentials baked; set MUGIWARA_* build variables for a packaged build.",
  );
}
