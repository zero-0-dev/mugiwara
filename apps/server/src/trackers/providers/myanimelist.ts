import { axiosTrackerHttp, type TrackerHttp } from "../http";
import {
  fromMalScore,
  fromMalStatus,
  toMalScore,
  toMalStatus,
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

const API_URL = "https://api.myanimelist.net/v2";
const OAUTH_AUTHORIZE_URL = "https://myanimelist.net/v1/oauth2/authorize";
const OAUTH_TOKEN_URL = "https://myanimelist.net/v1/oauth2/token";

export const DEFAULT_MAL_USER_AGENT =
  "Mugiwara/0.1 (+https://github.com/zero-0-dev/mugiwara)";

export interface MalProviderOptions {
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  userAgent?: string;
  http?: TrackerHttp;
  now?: () => number;
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

interface MalListStatus {
  status?: string;
  score?: number | null;
  num_chapters_read?: number | null;
  updated_at?: string | null;
}

export class MalProvider implements TrackerProvider {
  readonly id = "myanimelist" as const;
  readonly label = "MyAnimeList";
  readonly scoreMax = 10;
  // MAL documents only the `plain` PKCE method; S256 is rejected.
  readonly pkceMethod = "plain" as const;

  private readonly http: TrackerHttp;
  private readonly now: () => number;
  private readonly userAgent: string;

  constructor(private readonly options: MalProviderOptions) {
    this.http = options.http ?? axiosTrackerHttp;
    this.now = options.now ?? Date.now;
    this.userAgent = options.userAgent ?? DEFAULT_MAL_USER_AGENT;
  }

  authorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
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
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
      client_id: this.options.clientId,
    });
    if (this.options.clientSecret) {
      body.set("client_secret", this.options.clientSecret);
    }
    const response = await this.http.request({
      method: "POST",
      url: OAUTH_TOKEN_URL,
      headers: {
        ...this.clientHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: body.toString(),
    });
    const payload = record(response.data);
    if (!stringOrNull(payload.access_token)) {
      throw new TrackerHttpError("MyAnimeList did not return an access token", {
        kind: "invalid",
        status: response.status,
      });
    }
    const tokens = this.toTokens(payload);
    const user = await this.getViewer(tokens.accessToken);
    return { tokens, user };
  }

  async refresh(refreshToken: string): Promise<TrackerTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.options.clientId,
    });
    if (this.options.clientSecret) {
      body.set("client_secret", this.options.clientSecret);
    }
    const response = await this.http.request({
      method: "POST",
      url: OAUTH_TOKEN_URL,
      headers: {
        ...this.clientHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: body.toString(),
    });
    const payload = record(response.data);
    if (!stringOrNull(payload.access_token)) {
      throw new TrackerHttpError(
        "MyAnimeList did not return a refreshed token",
        { kind: "auth", status: response.status },
      );
    }
    return this.toTokens(payload);
  }

  async getViewer(accessToken: string): Promise<TrackerUser> {
    const response = await this.http.request({
      method: "GET",
      url: `${API_URL}/users/@me`,
      headers: this.authHeaders(accessToken),
      params: { fields: "id,name" },
    });
    const payload = record(response.data);
    const id = numberOrNull(payload.id);
    if (id == null) {
      throw new TrackerHttpError("MyAnimeList viewer is unavailable", {
        kind: "auth",
      });
    }
    return {
      id: String(id),
      name: stringOrNull(payload.name) ?? "MyAnimeList user",
    };
  }

  async search(
    accessToken: string,
    query: string,
  ): Promise<TrackerCandidate[]> {
    const response = await this.http.request({
      method: "GET",
      url: `${API_URL}/manga`,
      headers: this.authHeaders(accessToken),
      params: {
        q: query,
        limit: 10,
        fields:
          "id,title,alternative_titles,start_date,main_picture,num_chapters",
      },
    });
    const payload = record(response.data);
    const data = Array.isArray(payload.data) ? payload.data : [];
    const candidates: TrackerCandidate[] = [];
    for (const item of data) {
      const node = record(record(item).node);
      const id = numberOrNull(node.id);
      if (id == null) continue;
      const alt = record(node.alternative_titles);
      const synonyms = Array.isArray(alt.synonyms)
        ? alt.synonyms.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      candidates.push({
        trackerMangaId: String(id),
        title: stringOrNull(node.title) ?? `MAL #${id}`,
        altTitles: [
          stringOrNull(alt.en),
          stringOrNull(alt.ja),
          ...synonyms,
        ].filter((value): value is string => Boolean(value)),
        year: numberOrNull(record(node.start_date).year),
        chapters: numberOrNull(node.num_chapters),
        coverImage: stringOrNull(record(node.main_picture).medium),
      });
    }
    return candidates;
  }

  async getEntry(
    accessToken: string,
    trackerMangaId: string,
  ): Promise<TrackerEntry | null> {
    let response;
    try {
      response = await this.http.request({
        method: "GET",
        url: `${API_URL}/manga/${encodeURIComponent(trackerMangaId)}`,
        headers: this.authHeaders(accessToken),
        params: {
          fields:
            "id,num_chapters,my_list_status{status,score,num_chapters_read,updated_at}",
        },
      });
    } catch (error) {
      if (error instanceof TrackerHttpError && error.status === 404) return null;
      throw error;
    }

    const node = record(response.data);
    const listStatus = record(node.my_list_status) as MalListStatus;
    return {
      trackerMangaId,
      status: fromMalStatus(listStatus.status),
      score: fromMalScore(listStatus.score),
      chaptersRead:
        typeof listStatus.num_chapters_read === "number"
          ? Math.max(0, listStatus.num_chapters_read)
          : 0,
      totalChapters: numberOrNull(node.num_chapters),
      updatedAt: stringOrNull(listStatus.updated_at),
    };
  }

  async updateEntry(
    accessToken: string,
    trackerMangaId: string,
    update: TrackerEntryUpdate,
  ): Promise<TrackerEntry> {
    const body = new URLSearchParams({
      status: toMalStatus(update.status),
      score: String(toMalScore(update.score)),
      num_chapters_read: String(Math.max(0, Math.floor(update.chaptersRead))),
    });
    const response = await this.http.request({
      method: "PATCH",
      url: `${API_URL}/manga/${encodeURIComponent(trackerMangaId)}/my_list_status`,
      headers: {
        ...this.authHeaders(accessToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: body.toString(),
    });
    const payload = record(response.data) as MalListStatus;
    return {
      trackerMangaId,
      status: fromMalStatus(payload.status),
      score: fromMalScore(payload.score),
      chaptersRead:
        typeof payload.num_chapters_read === "number"
          ? Math.max(0, payload.num_chapters_read)
          : Math.max(0, Math.floor(update.chaptersRead)),
      totalChapters: update.totalChapters ?? null,
      updatedAt: stringOrNull(payload.updated_at),
    };
  }

  async list(accessToken: string, _userId: string): Promise<TrackerEntry[]> {
    const entries: TrackerEntry[] = [];
    const limit = 1000;
    let offset = 0;
    // MAL caps a page at 1000 entries. Follow `next_offset` so large lists are
    // not silently truncated during a pull-all.
    for (let page = 0; page < 20; page += 1) {
      const response = await this.http.request({
        method: "GET",
        url: `${API_URL}/users/@me/mangalist`,
        headers: this.authHeaders(accessToken),
        params: {
          fields:
            "id,title,num_chapters,list_status{status,score,num_chapters_read,updated_at}",
          limit,
          offset,
          nsfw: "true",
        },
      });
      const payload = record(response.data);
      const data = Array.isArray(payload.data) ? payload.data : [];
      for (const item of data) {
        const row = record(item);
        const node = record(row.node);
        const status = record(row.list_status) as MalListStatus;
        const id = numberOrNull(node.id);
        if (id == null) continue;
        entries.push({
          trackerMangaId: String(id),
          status: fromMalStatus(status.status),
          score: fromMalScore(status.score),
          chaptersRead:
            typeof status.num_chapters_read === "number"
              ? Math.max(0, status.num_chapters_read)
              : 0,
          totalChapters: numberOrNull(node.num_chapters),
          updatedAt: stringOrNull(status.updated_at),
        });
      }
      const nextOffset = numberOrNull(record(payload.paging).next_offset);
      if (nextOffset == null || data.length === 0) break;
      offset = nextOffset;
    }
    return entries;
  }

  private clientHeaders(): Record<string, string> {
    return {
      "X-MAL-CLIENT-ID": this.options.clientId,
      "User-Agent": this.userAgent,
      Accept: "application/json",
    };
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return {
      ...this.clientHeaders(),
      Authorization: `Bearer ${accessToken}`,
    };
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
}
