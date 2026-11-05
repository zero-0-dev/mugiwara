import type { ReadingStatus } from "@mugiwara-manga/types";

export type TrackerProviderId = "anilist" | "myanimelist";
export type SyncDirection = "push" | "pull";

export const TRACKER_PROVIDER_IDS: TrackerProviderId[] = [
  "anilist",
  "myanimelist",
];

export interface TrackerCandidate {
  trackerMangaId: string;
  title: string;
  altTitles: string[];
  year: number | null;
  chapters: number | null;
  coverImage: string | null;
}

export interface TrackerEntry {
  trackerMangaId: string;
  status: ReadingStatus;
  /** Provider-native score (AniList 0-100, MAL 0-10). */
  score: number | null;
  chaptersRead: number;
  totalChapters: number | null;
  updatedAt: string | null;
}

export interface TrackerEntryUpdate {
  status: ReadingStatus;
  /** Provider-native score (AniList 0-100, MAL 0-10). */
  score: number | null;
  chaptersRead: number;
  totalChapters?: number | null;
}

export interface TrackerTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
}

export interface TrackerUser {
  id: string;
  name: string;
}

export interface TrackerProvider {
  readonly id: TrackerProviderId;
  readonly label: string;
  /** Highest valid provider-native score. */
  readonly scoreMax: number;

  authorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;

  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ tokens: TrackerTokens; user: TrackerUser }>;

  refresh(refreshToken: string): Promise<TrackerTokens>;

  getViewer(accessToken: string): Promise<TrackerUser>;

  search(accessToken: string, query: string): Promise<TrackerCandidate[]>;

  getEntry(
    accessToken: string,
    trackerMangaId: string,
  ): Promise<TrackerEntry | null>;

  updateEntry(
    accessToken: string,
    trackerMangaId: string,
    update: TrackerEntryUpdate,
  ): Promise<TrackerEntry>;

  list(accessToken: string, userId: string): Promise<TrackerEntry[]>;
}

export type TrackerErrorKind =
  | "auth"
  | "rate_limit"
  | "network"
  | "server"
  | "invalid";

export class TrackerHttpError extends Error {
  readonly kind: TrackerErrorKind;
  readonly status: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: {
      kind: TrackerErrorKind;
      status?: number | null;
      retryAfterMs?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "TrackerHttpError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function isTrackerProviderId(value: unknown): value is TrackerProviderId {
  return value === "anilist" || value === "myanimelist";
}

export const TRACKER_STATUSES: ReadingStatus[] = [
  "reading",
  "completed",
  "on_hold",
  "dropped",
  "plan_to_read",
];

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return (
    typeof value === "string" &&
    (TRACKER_STATUSES as string[]).includes(value)
  );
}

export function statusLabel(status: ReadingStatus): string {
  switch (status) {
    case "reading":
      return "Reading";
    case "completed":
      return "Completed";
    case "on_hold":
      return "On hold";
    case "dropped":
      return "Dropped";
    case "plan_to_read":
      return "Plan to read";
    default:
      return status;
  }
}
