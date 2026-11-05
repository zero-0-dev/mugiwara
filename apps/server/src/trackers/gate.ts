import type { TrackerProviderId } from "./types";

const DEFAULT_INTERVAL_MS: Record<TrackerProviderId, number> = {
  // AniList ~90 requests/minute.
  anilist: 700,
  // MAL ~3 requests/second.
  myanimelist: 340,
};

/**
 * Shared per-provider request gate. Manual sync, scheduled pulls and the
 * background queue all pass through it, so a large library cannot burst past
 * the provider limits.
 */
export function createProviderRateGate(
  options: {
    intervals?: Partial<Record<TrackerProviderId, number>>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): (provider: TrackerProviderId) => Promise<void> {
  const intervals = { ...DEFAULT_INTERVAL_MS, ...options.intervals };
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const nextAt: Record<TrackerProviderId, number> = {
    anilist: 0,
    myanimelist: 0,
  };

  return async (provider) => {
    const interval = intervals[provider] ?? 0;
    if (interval <= 0) return;
    const wait = nextAt[provider] - now();
    if (wait > 0) await sleep(wait);
    nextAt[provider] = now() + interval;
  };
}
