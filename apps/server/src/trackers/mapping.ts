import type { ReadingStatus } from "@mugiwara-manga/types";

export const ANILIST_SCORE_MAX = 100;
export const MAL_SCORE_MAX = 10;

const ANILIST_STATUS_TO_LOCAL: Record<string, ReadingStatus> = {
  CURRENT: "reading",
  COMPLETED: "completed",
  PAUSED: "on_hold",
  DROPPED: "dropped",
  PLANNING: "plan_to_read",
  REPEATING: "reading",
};

const LOCAL_TO_ANILIST_STATUS: Record<ReadingStatus, string> = {
  reading: "CURRENT",
  completed: "COMPLETED",
  on_hold: "PAUSED",
  dropped: "DROPPED",
  plan_to_read: "PLANNING",
};

const MAL_STATUS_TO_LOCAL: Record<string, ReadingStatus> = {
  reading: "reading",
  completed: "completed",
  on_hold: "on_hold",
  dropped: "dropped",
  plan_to_read: "plan_to_read",
};

const LOCAL_TO_MAL_STATUS: Record<ReadingStatus, string> = {
  reading: "reading",
  completed: "completed",
  on_hold: "on_hold",
  dropped: "dropped",
  plan_to_read: "plan_to_read",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function fromAniListStatus(
  value: string | null | undefined,
): ReadingStatus {
  if (!value) return "plan_to_read";
  return ANILIST_STATUS_TO_LOCAL[value.toUpperCase()] ?? "plan_to_read";
}

export function toAniListStatus(status: ReadingStatus): string {
  return LOCAL_TO_ANILIST_STATUS[status] ?? "PLANNING";
}

export function fromMalStatus(value: string | null | undefined): ReadingStatus {
  if (!value) return "plan_to_read";
  return MAL_STATUS_TO_LOCAL[value.toLowerCase()] ?? "plan_to_read";
}

export function toMalStatus(status: ReadingStatus): string {
  return LOCAL_TO_MAL_STATUS[status] ?? "plan_to_read";
}

/** AniList stores a raw 0-100 score; 0 means "not scored". */
export function fromAniListScore(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(clamp(parsed, 0, ANILIST_SCORE_MAX));
}

/** AniList expects scoreRaw 0-100, never a MAL 0-10 value. */
export function toAniListScore(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(clamp(value, 0, ANILIST_SCORE_MAX));
}

/** MAL stores an integer 0-10 score; 0 means "not scored". */
export function fromMalScore(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(clamp(parsed, 0, MAL_SCORE_MAX));
}

/** MAL expects score 0-10, never an AniList raw score. */
export function toMalScore(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(clamp(value, 0, MAL_SCORE_MAX));
}

/** Maps a stored provider-native score to a 0-10 value for display. */
export function displayScore(
  score: number | null,
  scoreMax: number,
): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (scoreMax <= 0) return null;
  return Math.round((score / scoreMax) * 10 * 10) / 10;
}
