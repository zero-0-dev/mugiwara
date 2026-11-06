import { axiosTrackerHttp, type TrackerHttp } from "../http";
import {
  fromAniListScore,
  fromAniListStatus,
  toAniListScore,
  toAniListStatus,
} from "../mapping";
import type {
  TrackerCandidate,
  TrackerEntry,
  TrackerEntryUpdate,
  TrackerProvider,
  TrackerTokens,
  TrackerUser,
} from "../types";
import { TrackerHttpError } from "../types";

const API_URL = "https://graphql.anilist.co";
const OAUTH_AUTHORIZE_URL = "https://anilist.co/api/v2/oauth/authorize";
const OAUTH_TOKEN_URL = "https://anilist.co/api/v2/oauth/token";

export interface AniListProviderOptions {
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  http?: TrackerHttp;
  now?: () => number;
}

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string; status?: number }>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export class AniListProvider implements TrackerProvider {
  readonly id = "anilist" as const;
  readonly label = "AniList";
  readonly scoreMax = 100;
  readonly pkceMethod = "S256" as const;

  private readonly http: TrackerHttp;
  private readonly now: () => number;

  constructor(private readonly options: AniListProviderOptions) {
    this.http = options.http ?? axiosTrackerHttp;
    this.now = options.now ?? Date.now;
  }

  authorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: this.pkceMethod,
    });
    return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<{ tokens: TrackerTokens; user: TrackerUser }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
      code: input.code,
      code_verifier: input.codeVerifier,
    });
    if (this.options.clientSecret) {
      body.set("client_secret", this.options.clientSecret);
    }

    const response = await this.http.request({
      method: "POST",
      url: OAUTH_TOKEN_URL,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      data: body.toString(),
    });
    const payload = record(response.data);
    const accessToken = stringOrNull(payload.access_token);
    if (!accessToken) {
      throw new TrackerHttpError("AniList did not return an access token", {
        kind: "invalid",
        status: response.status,
      });
    }
    const tokens = this.toTokens(payload);
    const user = await this.getViewer(accessToken);
    return { tokens, user };
  }

  async refresh(refreshToken: string): Promise<TrackerTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.options.clientId,
      refresh_token: refreshToken,
    });
    if (this.options.clientSecret) {
      body.set("client_secret", this.options.clientSecret);
    }
    const response = await this.http.request({
      method: "POST",
      url: OAUTH_TOKEN_URL,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      data: body.toString(),
    });
    const payload = record(response.data);
    if (!stringOrNull(payload.access_token)) {
      throw new TrackerHttpError("AniList did not return a refreshed token", {
        kind: "auth",
        status: response.status,
      });
    }
    return this.toTokens(payload);
  }

  async getViewer(accessToken: string): Promise<TrackerUser> {
    const data = await this.graphql<{
      Viewer?: { id?: number; name?: string };
    }>(accessToken, `query { Viewer { id name } }`);
    const viewer = data.Viewer;
    if (!viewer?.id) {
      throw new TrackerHttpError("AniList viewer is unavailable", {
        kind: "auth",
      });
    }
    return { id: String(viewer.id), name: viewer.name ?? "AniList user" };
  }

  async search(
    accessToken: string,
    query: string,
  ): Promise<TrackerCandidate[]> {
    const data = await this.graphql<{
      Page?: { media?: Array<Record<string, unknown>> };
    }>(
      accessToken,
      `query SearchManga($search: String) {
        Page(perPage: 10) {
          media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
            id
            title { romaji english native }
            synonyms
            startDate { year }
            chapters
            coverImage { large }
          }
        }
      }`,
      { search: query },
    );

    const media = data.Page?.media ?? [];
    return media.map((item) => {
      const title = record(item.title);
      const romaji = stringOrNull(title.romaji);
      const english = stringOrNull(title.english);
      const native = stringOrNull(title.native);
      const synonyms = Array.isArray(item.synonyms)
        ? item.synonyms.filter((value): value is string => typeof value === "string")
        : [];
      return {
        trackerMangaId: String(item.id),
        title: english ?? romaji ?? native ?? `AniList #${String(item.id)}`,
        altTitles: [romaji, native, ...synonyms].filter(
          (value): value is string => Boolean(value),
        ),
        year: numberOrNull(record(item.startDate).year),
        chapters: numberOrNull(item.chapters),
        coverImage: stringOrNull(record(item.coverImage).large),
      };
    });
  }

  async getEntry(
    accessToken: string,
    trackerMangaId: string,
  ): Promise<TrackerEntry | null> {
    const id = Number(trackerMangaId);
    if (!Number.isInteger(id)) return null;

    const data = await this.graphql<{
      Media?: {
        chapters?: number | null;
        mediaListEntry?: {
          status?: string;
          score?: number | null;
          progress?: number | null;
          updatedAt?: number | null;
        } | null;
      } | null;
    }>(
      accessToken,
      `query MediaEntry($id: Int!) {
        Media(id: $id, type: MANGA) {
          chapters
          mediaListEntry {
            status
            score(format: POINT_100)
            progress
            updatedAt
          }
        }
      }`,
      { id },
    );

    const media = data.Media;
    if (!media) return null;
    const entry = media.mediaListEntry;
    if (!entry) {
      return {
        trackerMangaId,
        status: "plan_to_read",
        score: null,
        chaptersRead: 0,
        totalChapters: numberOrNull(media.chapters),
        updatedAt: null,
      };
    }
    return {
      trackerMangaId,
      status: fromAniListStatus(entry.status),
      score: fromAniListScore(entry.score),
      chaptersRead:
        typeof entry.progress === "number" ? Math.max(0, entry.progress) : 0,
      totalChapters: numberOrNull(media.chapters),
      updatedAt:
        typeof entry.updatedAt === "number"
          ? new Date(entry.updatedAt * 1000).toISOString()
          : null,
    };
  }

  async updateEntry(
    accessToken: string,
    trackerMangaId: string,
    update: TrackerEntryUpdate,
  ): Promise<TrackerEntry> {
    const mediaId = Number(trackerMangaId);
    if (!Number.isInteger(mediaId)) {
      throw new TrackerHttpError("Invalid AniList media id", {
        kind: "invalid",
      });
    }

    const data = await this.graphql<{
      SaveMediaListEntry?: {
        status?: string;
        score?: number | null;
        progress?: number | null;
        updatedAt?: number | null;
      } | null;
    }>(
      accessToken,
      `mutation SaveEntry($mediaId: Int!, $status: MediaListStatus, $scoreRaw: Int, $progress: Int) {
        SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress) {
          status
          score(format: POINT_100)
          progress
          updatedAt
        }
      }`,
      {
        mediaId,
        status: toAniListStatus(update.status),
        scoreRaw: toAniListScore(update.score),
        progress: Math.max(0, Math.floor(update.chaptersRead)),
      },
    );

    const entry = data.SaveMediaListEntry;
    if (!entry) {
      throw new TrackerHttpError("AniList rejected the list update", {
        kind: "invalid",
      });
    }
    return {
      trackerMangaId,
      status: fromAniListStatus(entry.status),
      score: fromAniListScore(entry.score),
      chaptersRead:
        typeof entry.progress === "number" ? Math.max(0, entry.progress) : 0,
      totalChapters: update.totalChapters ?? null,
      updatedAt:
        typeof entry.updatedAt === "number"
          ? new Date(entry.updatedAt * 1000).toISOString()
          : null,
    };
  }

  async list(accessToken: string, userId: string): Promise<TrackerEntry[]> {
    const id = Number(userId);
    if (!Number.isInteger(id)) return [];
    const data = await this.graphql<{
      MediaListCollection?: {
        lists?: Array<{
          entries?: Array<{
            mediaId?: number;
            status?: string;
            score?: number | null;
            progress?: number | null;
            updatedAt?: number | null;
            media?: { chapters?: number | null } | null;
          }>;
        }>;
      } | null;
    }>(
      accessToken,
      `query UserList($userId: Int!) {
        MediaListCollection(userId: $userId, type: MANGA) {
          lists {
            entries {
              mediaId
              status
              score(format: POINT_100)
              progress
              updatedAt
              media { chapters }
            }
          }
        }
      }`,
      { userId: id },
    );

    const entries: TrackerEntry[] = [];
    for (const list of data.MediaListCollection?.lists ?? []) {
      for (const entry of list.entries ?? []) {
        if (!entry.mediaId) continue;
        entries.push({
          trackerMangaId: String(entry.mediaId),
          status: fromAniListStatus(entry.status),
          score: fromAniListScore(entry.score),
          chaptersRead:
            typeof entry.progress === "number" ? Math.max(0, entry.progress) : 0,
          totalChapters: numberOrNull(entry.media?.chapters),
          updatedAt:
            typeof entry.updatedAt === "number"
              ? new Date(entry.updatedAt * 1000).toISOString()
              : null,
        });
      }
    }
    return entries;
  }

  private toTokens(payload: Record<string, unknown>): TrackerTokens {
    const expiresIn = numberOrNull(payload.expires_in);
    return {
      accessToken: String(payload.access_token),
      refreshToken: stringOrNull(payload.refresh_token),
      expiresAt:
        expiresIn != null
          ? new Date(this.now() + expiresIn * 1000).toISOString()
          : null,
      tokenType: stringOrNull(payload.token_type) ?? "Bearer",
      scope: stringOrNull(payload.scope),
    };
  }

  private async graphql<T>(
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.http.request({
      method: "POST",
      url: API_URL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      data: { query, variables },
    });
    const payload = record(response.data) as GraphQLResponse;
    if (payload.errors && payload.errors.length > 0) {
      const status = payload.errors[0]?.status;
      throw new TrackerHttpError(
        payload.errors[0]?.message ?? "AniList GraphQL error",
        {
          kind:
            status === 401 || status === 403
              ? "auth"
              : status === 429
                ? "rate_limit"
                : "invalid",
          status: status ?? null,
        },
      );
    }
    return (payload.data ?? {}) as T;
  }
}
