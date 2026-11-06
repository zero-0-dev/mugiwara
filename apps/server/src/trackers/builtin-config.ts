import { readFileSync } from "fs";
import { join } from "path";

/**
 * Credentials baked into an official build at packaging time.
 *
 * The release build runs `scripts/generate-tracker-config.mjs`, which writes
 * `builtin-trackers.json` next to this compiled module. The file is never
 * committed and is not read from the source tree; development and custom
 * builds fall back to environment variables.
 */
export interface BakedTrackerConfig {
  anilistClientId?: string;
  anilistClientSecret?: string;
  anilistRedirectUri?: string;
  malClientId?: string;
  malClientSecret?: string;
  malRedirectUri?: string;
  malUserAgent?: string;
}

const EMPTY_CONFIG: BakedTrackerConfig = {};

function stringValue(
  source: Record<string, unknown>,
  key: keyof BakedTrackerConfig,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readBakedTrackerConfig(
  filePath = join(__dirname, "builtin-trackers.json"),
): BakedTrackerConfig {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<
      string,
      unknown
    >;
    if (!parsed || typeof parsed !== "object") return EMPTY_CONFIG;
    return {
      anilistClientId: stringValue(parsed, "anilistClientId"),
      anilistClientSecret: stringValue(parsed, "anilistClientSecret"),
      anilistRedirectUri: stringValue(parsed, "anilistRedirectUri"),
      malClientId: stringValue(parsed, "malClientId"),
      malClientSecret: stringValue(parsed, "malClientSecret"),
      malRedirectUri: stringValue(parsed, "malRedirectUri"),
      malUserAgent: stringValue(parsed, "malUserAgent"),
    };
  } catch {
    // No baked config in development/source builds.
    return EMPTY_CONFIG;
  }
}

let cached: BakedTrackerConfig | null = null;

export function loadBakedTrackerConfig(): BakedTrackerConfig {
  if (cached === null) {
    cached = readBakedTrackerConfig();
  }
  return cached;
}

/** Test helper: re-read the baked file on the next call. */
export function resetBakedTrackerConfigCache(): void {
  cached = null;
}
