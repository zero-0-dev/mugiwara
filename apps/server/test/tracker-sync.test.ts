import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  chapterRepository,
  closeDatabase,
  db,
  initDatabase,
  mangaRepository,
  progressRepository,
  trackerRepository,
  chapters as chaptersTable,
  manga as mangaTable,
  readingProgress,
  trackerAccounts,
  trackerOAuthStates,
  tracking as trackingTable,
} from "../src/database";
import { createTrackerProvider } from "../src/trackers/config";
import { decryptSecret, encryptSecret } from "../src/trackers/crypto";
import {
  fromAniListScore,
  fromAniListStatus,
  fromMalScore,
  fromMalStatus,
  toAniListScore,
  toAniListStatus,
  toMalScore,
  toMalStatus,
} from "../src/trackers/mapping";
import { createPkcePair } from "../src/trackers/oauth";
import { TrackerSyncQueue } from "../src/trackers/queue";
import { TrackerService } from "../src/trackers/service";
import {
  TrackerHttpError,
  type TrackerCandidate,
  type TrackerEntry,
  type TrackerEntryUpdate,
  type TrackerProvider,
  type TrackerTokens,
  type TrackerUser,
} from "../src/trackers/types";

const NOW = Date.parse("2026-01-02T03:04:05.000Z");

class FakeProvider implements TrackerProvider {
  readonly id = "anilist" as const;
  readonly label = "Fake AniList";
  readonly scoreMax = 100;
  readonly pkceMethod = "S256" as const;
  entries = new Map<string, TrackerEntry>();
  updates: Array<{ id: string; update: TrackerEntryUpdate }> = [];
  refreshCalls = 0;
  getUserCalls = 0;
  failNextUpdate: TrackerHttpError | null = null;
  failNextGet: TrackerHttpError | null = null;
  private clock = NOW;

  authorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    return `https://example.test/oauth?state=${input.state}&challenge=${input.codeChallenge}&redirect=${encodeURIComponent(input.redirectUri)}`;
  }

  async exchangeCode(): Promise<{
    tokens: TrackerTokens;
    user: TrackerUser;
  }> {
    return {
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: new Date(NOW + 3600_000).toISOString(),
      },
      user: { id: "42", name: "Test Reader" },
    };
  }

  async refresh(): Promise<TrackerTokens> {
    this.refreshCalls += 1;
    return {
      accessToken: "refreshed-access-token",
      refreshToken: "refreshed-refresh-token",
      expiresAt: new Date(NOW + 3600_000).toISOString(),
    };
  }

  async getViewer(): Promise<TrackerUser> {
    this.getUserCalls += 1;
    return { id: "42", name: "Test Reader" };
  }

  async search(
    _token: string,
    query: string,
  ): Promise<TrackerCandidate[]> {
    return [
      {
        trackerMangaId: "900",
        title: query,
        altTitles: ["Alt Title"],
        year: 2020,
        chapters: 3,
        coverImage: null,
      },
    ];
  }

  async getEntry(
    _token: string,
    trackerMangaId: string,
  ): Promise<TrackerEntry | null> {
    if (this.failNextGet) {
      const error = this.failNextGet;
      this.failNextGet = null;
      throw error;
    }
    return this.entries.get(trackerMangaId) ?? null;
  }

  async updateEntry(
    _token: string,
    trackerMangaId: string,
    update: TrackerEntryUpdate,
  ): Promise<TrackerEntry> {
    if (this.failNextUpdate) {
      const error = this.failNextUpdate;
      this.failNextUpdate = null;
      throw error;
    }
    this.updates.push({ id: trackerMangaId, update });
    const entry: TrackerEntry = {
      trackerMangaId,
      status: update.status,
      score: update.score,
      chaptersRead: update.chaptersRead,
      totalChapters: update.totalChapters ?? null,
      updatedAt: new Date(this.clock).toISOString(),
    };
    this.entries.set(trackerMangaId, entry);
    return entry;
  }

  async list(): Promise<TrackerEntry[]> {
    return [...this.entries.values()];
  }
}

async function resetDatabase() {
  await db.delete(trackerOAuthStates);
  await db.delete(trackerAccounts);
  await db.delete(trackingTable);
  await db.delete(readingProgress);
  await db.delete(chaptersTable);
  await db.delete(mangaTable);
}

async function seedManga(chapterCount = 3, completed = 0) {
  await mangaRepository.create({
    id: "manga-1",
    title: "Test Manga",
    altTitles: ["Test Alt"],
    sourceId: "local",
    status: "ongoing",
    mediaType: "manga",
  });
  const chapterIds: string[] = [];
  for (let index = 0; index < chapterCount; index += 1) {
    const chapter = await chapterRepository.create({
      id: `chapter-${index}-${Math.random().toString(36).slice(2)}`,
      mangaId: "manga-1",
      chapterId: String(index + 1),
      pagesCount: 10,
      sortOrder: index,
    });
    chapterIds.push(chapter!.id);
  }
  if (completed > 0) {
    await progressRepository.markChaptersComplete(
      "manga-1",
      chapterIds.slice(0, completed),
      true,
    );
  }
  return chapterIds;
}

async function saveAccount(
  options: { expiresAt?: string; refreshToken?: string | null } = {},
) {
  await trackerRepository.saveAccount("anilist", {
    externalUserId: "42",
    username: "Test Reader",
    accessTokenEnc: encryptSecret("access-token"),
    refreshTokenEnc:
      options.refreshToken === null
        ? null
        : encryptSecret(options.refreshToken ?? "refresh-token"),
    expiresAt: options.expiresAt ?? new Date(NOW + 3600_000).toISOString(),
  });
}

function createService(provider: FakeProvider, now = () => NOW) {
  return new TrackerService({
    getProvider: () => provider,
    getBaseUrl: () => "http://localhost:3001",
    now,
  });
}

const fake = new FakeProvider();

beforeAll(() => {
  initDatabase();
});

afterAll(() => {
  closeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  fake.entries.clear();
  fake.updates = [];
  fake.refreshCalls = 0;
  fake.getUserCalls = 0;
  fake.failNextUpdate = null;
  fake.failNextGet = null;
});

describe("tracker mappings", () => {
  it("maps AniList statuses and keeps the 0-100 score scale", () => {
    expect(fromAniListStatus("CURRENT")).toBe("reading");
    expect(fromAniListStatus("PAUSED")).toBe("on_hold");
    expect(fromAniListStatus("PLANNING")).toBe("plan_to_read");
    expect(toAniListStatus("completed")).toBe("COMPLETED");
    expect(toAniListStatus("on_hold")).toBe("PAUSED");

    expect(fromAniListScore(87)).toBe(87);
    expect(fromAniListScore(0)).toBeNull();
    expect(toAniListScore(87)).toBe(87);
    expect(toAniListScore(140)).toBe(100);
    expect(toAniListScore(7)).toBe(7);
  });

  it("maps MyAnimeList statuses and keeps the 0-10 score scale", () => {
    expect(fromMalStatus("on_hold")).toBe("on_hold");
    expect(fromMalStatus("plan_to_read")).toBe("plan_to_read");
    expect(toMalStatus("dropped")).toBe("dropped");

    expect(fromMalScore(8)).toBe(8);
    expect(fromMalScore(0)).toBeNull();
    expect(toMalScore(8)).toBe(8);
    expect(toMalScore(87)).toBe(10);
  });

  it("encrypts tokens with AES-256-GCM and does not leak the plaintext", () => {
    const encrypted = encryptSecret("super-secret-token");
    expect(encrypted).not.toContain("super-secret-token");
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptSecret(encrypted)).toBe("super-secret-token");
  });
});

describe("pkce methods", () => {
  it("uses the plain challenge method for MyAnimeList", () => {
    const redirectUri =
      "http://localhost/api/trackers/myanimelist/auth/callback";
    const provider = createTrackerProvider("myanimelist", {
      redirectUri,
      env: { malClientId: "client-id" },
    });
    const pair = createPkcePair(provider.pkceMethod);
    expect(pair.challenge).toBe(pair.verifier);

    const url = new URL(
      provider.authorizationUrl({
        state: "state",
        codeChallenge: pair.challenge,
        redirectUri,
      }),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("plain");
    expect(url.searchParams.get("code_challenge")).toBe(pair.verifier);
  });

  it("uses an S256 challenge for AniList", () => {
    const redirectUri = "http://localhost/api/trackers/anilist/auth/callback";
    const provider = createTrackerProvider("anilist", {
      redirectUri,
      env: { anilistClientId: "client-id" },
    });
    const pair = createPkcePair(provider.pkceMethod);
    expect(pair.challenge).not.toBe(pair.verifier);

    const url = new URL(
      provider.authorizationUrl({
        state: "state",
        codeChallenge: pair.challenge,
        redirectUri,
      }),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pair.challenge);
  });
});

describe("linking", () => {
  it("uses existing AniList ids as the top suggestion without an account", async () => {
    await mangaRepository.create({
      id: "manga-1",
      title: "Test Manga",
      sourceId: "local",
      status: "ongoing",
      mediaType: "manga",
      anilistId: 12345,
    });
    const service = createService(fake);
    const suggestions = await service.suggestCandidates("manga-1", "anilist");
    expect(suggestions[0]?.trackerMangaId).toBe("12345");
    expect(suggestions[0]?.confidence).toBe(1);
  });

  it("links a manga and pushes local completed chapters", async () => {
    await seedManga(3, 1);
    await saveAccount();
    fake.entries.set("900", {
      trackerMangaId: "900",
      status: "plan_to_read",
      score: null,
      chaptersRead: 0,
      totalChapters: 3,
      updatedAt: new Date(NOW - 10_000).toISOString(),
    });
    const service = createService(fake);

    const link = await service.link("manga-1", "anilist", "900");
    expect(link.provider).toBe("anilist");
    expect(link.chaptersRead).toBe(1);

    const result = await service.push("manga-1", "anilist");
    expect(result.state).toBe("synced");
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]?.update.chaptersRead).toBe(1);
    expect(fake.updates[0]?.update.status).toBe("reading");

    const row = await trackerRepository.findTracking("manga-1", "anilist");
    expect(row?.syncState).toBe("synced");
    expect(row?.localDirty).toBe(false);
    expect(row?.lastPushedAt).toBeTruthy();
  });

  it("requires confirmation for manual linking when the remote entry is missing", async () => {
    await seedManga(3, 0);
    await saveAccount();
    const service = createService(fake);
    const link = await service.link("manga-1", "anilist", "456");
    expect(link.trackerMangaId).toBe("456");
    expect(link.status).toBe("reading");
    expect(link.syncState).toBe("synced");
  });
});

describe("push and pull", () => {
  it("pulls remote progress into local completed chapters", async () => {
    const chapterIds = await seedManga(4, 0);
    await saveAccount();
    fake.entries.set("900", {
      trackerMangaId: "900",
      status: "reading",
      score: 85,
      chaptersRead: 2,
      totalChapters: 4,
      updatedAt: new Date(NOW - 5_000).toISOString(),
    });
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: 85,
      chaptersRead: 0,
      remoteUpdatedAt: new Date(NOW - 10_000).toISOString(),
    });

    const service = createService(fake);
    const result = await service.pull("manga-1", "anilist");
    expect(result.state).toBe("synced");

    const progress = await progressRepository.findAllByMangaId("manga-1");
    const completed = progress.filter((row) => row.isCompleted);
    expect(completed.map((row) => row.chapterId).sort()).toEqual(
      chapterIds.slice(0, 2).sort(),
    );
  });

  it("detects a conflict when both sides changed and resolves it locally", async () => {
    await seedManga(3, 2);
    await saveAccount();
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 1,
      remoteUpdatedAt: new Date(NOW - 10_000).toISOString(),
    });
    await trackerRepository.markLocalDirty("manga-1");
    fake.entries.set("900", {
      trackerMangaId: "900",
      status: "completed",
      score: 95,
      chaptersRead: 3,
      totalChapters: 3,
      updatedAt: new Date(NOW).toISOString(),
    });

    const service = createService(fake);
    const pulled = await service.pull("manga-1", "anilist");
    expect(pulled.state).toBe("conflict");
    expect(pulled.conflict?.reason).toBe("both_changed");

    const row = await trackerRepository.findTracking("manga-1", "anilist");
    expect(row?.syncState).toBe("conflict");
    // Nothing was silently applied.
    const progress = await progressRepository.findAllByMangaId("manga-1");
    expect(progress.filter((item) => item.isCompleted)).toHaveLength(2);

    const resolved = await service.resolveConflict("manga-1", "anilist", "local");
    expect(resolved.state).toBe("synced");
    expect(fake.updates.at(-1)?.update.chaptersRead).toBe(2);
    expect(fake.entries.get("900")?.chaptersRead).toBe(2);
  });

  it("never silently lowers remote progress: records a conflict instead", async () => {
    await seedManga(4, 3);
    await saveAccount();
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 3,
      remoteUpdatedAt: new Date(NOW - 10_000).toISOString(),
    });
    fake.entries.set("900", {
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 1,
      totalChapters: 4,
      updatedAt: new Date(NOW).toISOString(),
    });

    const service = createService(fake);
    const pulled = await service.pull("manga-1", "anilist");
    expect(pulled.state).toBe("conflict");
    expect(pulled.conflict?.reason).toBe("remote_lower");
    const progress = await progressRepository.findAllByMangaId("manga-1");
    expect(progress.filter((item) => item.isCompleted)).toHaveLength(3);
  });
});

describe("token lifecycle", () => {
  it("refreshes an expired access token before calling the provider", async () => {
    await seedManga(2, 0);
    await saveAccount({ expiresAt: new Date(NOW - 60_000).toISOString() });
    fake.entries.set("900", {
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 1,
      totalChapters: 2,
      updatedAt: new Date(NOW).toISOString(),
    });
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: new Date(NOW - 10_000).toISOString(),
    });

    const service = createService(fake);
    await service.pull("manga-1", "anilist");
    expect(fake.refreshCalls).toBe(1);
    const account = await trackerRepository.findAccount("anilist");
    expect(decryptSecret(account!.accessTokenEnc)).toBe("refreshed-access-token");
  });

  it("surfaces a reconnect error when no refresh token is stored", async () => {
    await seedManga(2, 0);
    await saveAccount({
      expiresAt: new Date(NOW - 60_000).toISOString(),
      refreshToken: null,
    });
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: null,
    });
    const service = createService(fake);
    await expect(service.pull("manga-1", "anilist")).rejects.toMatchObject({
      kind: "auth",
    });
    const account = await trackerRepository.findAccount("anilist");
    expect(account?.lastError).toContain("Reconnect");
  });
});

describe("completion pushes", () => {
  it("marks links dirty and schedules a debounced push for writable accounts", async () => {
    await seedManga(2, 1);
    await saveAccount();
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: null,
    });
    const service = createService(fake);
    const scheduled = vi.fn();
    service.setLocalChangeHandler(scheduled);

    await service.noteChapterProgress("manga-1");
    expect(scheduled).toHaveBeenCalledWith("manga-1", "anilist");
    const row = await trackerRepository.findTracking("manga-1", "anilist");
    expect(row?.localDirty).toBe(true);
    expect(row?.syncState).toBe("pending");
  });

  it("does not queue pushes for read-only accounts", async () => {
    await seedManga(2, 1);
    await saveAccount();
    await trackerRepository.updateAccount("anilist", { readOnly: true });
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: null,
    });
    const service = createService(fake);
    const scheduled = vi.fn();
    service.setLocalChangeHandler(scheduled);

    await service.noteChapterProgress("manga-1");
    expect(scheduled).not.toHaveBeenCalled();
    const row = await trackerRepository.findTracking("manga-1", "anilist");
    expect(row?.localDirty).toBe(false);
  });
});

describe("rate limiting and failure paths", () => {
  it("retries a 429 and succeeds", async () => {
    let attempts = 0;
    const queue = new TrackerSyncQueue({
      rateLimits: { anilist: 0, myanimelist: 0 },
      backoffMs: 0,
      debounceMs: 0,
      sleep: async () => {},
      handler: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new TrackerHttpError("Too many requests", {
            kind: "rate_limit",
            status: 429,
            retryAfterMs: 0,
          });
        }
      },
    });
    queue.enqueue({ provider: "anilist", mangaId: "manga-1", direction: "push" });
    await queue.drain();
    expect(attempts).toBe(2);
    expect(queue.stats().processed).toBe(1);
    expect(queue.stats().failed).toBe(0);
  });

  it("marks a non-local network failure without corrupting local progress", async () => {
    await seedManga(3, 1);
    await saveAccount();
    fake.entries.set("900", {
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 0,
      totalChapters: 3,
      updatedAt: new Date(NOW - 1000).toISOString(),
    });
    await trackerRepository.upsertTracking({
      id: "track-1",
      mangaId: "manga-1",
      trackerType: "anilist",
      trackerMangaId: "900",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: new Date(NOW - 1000).toISOString(),
    });
    fake.failNextUpdate = new TrackerHttpError("socket hang up", {
      kind: "network",
    });

    const service = createService(fake);
    await expect(service.push("manga-1", "anilist")).rejects.toMatchObject({
      kind: "network",
    });
    const row = await trackerRepository.findTracking("manga-1", "anilist");
    expect(row?.syncState).toBe("error");
    expect(row?.syncError).toContain("socket hang up");
    const progress = await progressRepository.findAllByMangaId("manga-1");
    expect(progress.filter((item) => item.isCompleted)).toHaveLength(1);
  });

  it("bounds retries and reports the failure in queue stats", async () => {
    let attempts = 0;
    const queue = new TrackerSyncQueue({
      rateLimits: { anilist: 0, myanimelist: 0 },
      backoffMs: 0,
      debounceMs: 0,
      maxAttempts: 2,
      sleep: async () => {},
      handler: async () => {
        attempts += 1;
        throw new TrackerHttpError("offline", { kind: "network" });
      },
    });
    queue.enqueue({ provider: "anilist", mangaId: "manga-1", direction: "pull" });
    await queue.drain();
    expect(attempts).toBe(2);
    expect(queue.stats().failed).toBe(1);
    expect(queue.stats().lastError).toContain("offline");
  });
});
