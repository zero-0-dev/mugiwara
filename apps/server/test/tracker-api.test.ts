import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import {
  chapterRepository,
  closeDatabase,
  db,
  initDatabase,
  mangaRepository,
  trackerRepository,
  chapters as chaptersTable,
  manga as mangaTable,
  readingProgress,
  trackerAccounts,
  trackerOAuthStates,
  tracking as trackingTable,
} from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";
import { decryptSecret, encryptSecret } from "../src/trackers/crypto";
import { TrackerService } from "../src/trackers/service";
import type {
  TrackerCandidate,
  TrackerEntry,
  TrackerEntryUpdate,
  TrackerProvider,
  TrackerTokens,
  TrackerUser,
} from "../src/trackers/types";

class ApiFakeProvider implements TrackerProvider {
  readonly id = "anilist" as const;
  readonly label = "Fake";
  readonly scoreMax = 100;
  readonly pkceMethod = "S256" as const;
  entries = new Map<string, TrackerEntry>();

  authorizationUrl(input: { state: string; redirectUri: string }): string {
    return `https://example.test/auth?state=${encodeURIComponent(input.state)}&redirect=${encodeURIComponent(input.redirectUri)}`;
  }

  async exchangeCode(): Promise<{ tokens: TrackerTokens; user: TrackerUser }> {
    return {
      tokens: {
        accessToken: "plain-access-token",
        refreshToken: "plain-refresh-token",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
      user: { id: "7", name: "API Reader" },
    };
  }

  async refresh(): Promise<TrackerTokens> {
    return { accessToken: "refreshed-token" };
  }

  async getViewer(): Promise<TrackerUser> {
    return { id: "7", name: "API Reader" };
  }

  async search(): Promise<TrackerCandidate[]> {
    return [
      {
        trackerMangaId: "555",
        title: "Test Manga",
        altTitles: [],
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
    return this.entries.get(trackerMangaId) ?? null;
  }

  async updateEntry(
    _token: string,
    trackerMangaId: string,
    update: TrackerEntryUpdate,
  ): Promise<TrackerEntry> {
    const entry: TrackerEntry = {
      trackerMangaId,
      status: update.status,
      score: update.score,
      chaptersRead: update.chaptersRead,
      totalChapters: update.totalChapters ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(trackerMangaId, entry);
    return entry;
  }

  async list(): Promise<TrackerEntry[]> {
    return [...this.entries.values()];
  }
}

const provider = new ApiFakeProvider();
let app: ReturnType<typeof createApp>;
let token: string;

async function resetDatabase() {
  await db.delete(trackerOAuthStates);
  await db.delete(trackerAccounts);
  await db.delete(trackingTable);
  await db.delete(readingProgress);
  await db.delete(chaptersTable);
  await db.delete(mangaTable);
}

beforeAll(async () => {
  initDatabase();
  const auth = new AuthService(db);
  token = (await auth.createToken("tracker api test", true)).token;
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
  global.trackerService = new TrackerService({
    getProvider: () => provider,
    getBaseUrl: () => "http://localhost:3001",
  });
});

afterAll(() => {
  delete global.trackerService;
  closeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  provider.entries.clear();
});

describe("tracker OAuth API", () => {
  it("requires authentication for account endpoints", async () => {
    await request(app).get("/api/trackers/accounts").expect(401);
  });

  it("starts OAuth with PKCE state and completes the public callback", async () => {
    const started = await request(app)
      .post("/api/trackers/anilist/auth/start")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    expect(started.body.provider).toBe("anilist");
    expect(started.body.authorizationUrl).toContain("example.test/auth");
    expect(started.body.state).toBeTruthy();
    expect(started.body.redirectUri).toContain(
      "/api/trackers/anilist/auth/callback",
    );

    // No bearer token: providers redirect the browser without one. The
    // single-use state is the CSRF check.
    const callback = await request(app)
      .get("/api/trackers/anilist/auth/callback")
      .query({ code: "auth-code", state: started.body.state })
      .set("Accept", "application/json")
      .expect(200);

    expect(callback.body.account.connected).toBe(true);
    expect(callback.body.account.username).toBe("API Reader");
    expect(callback.body.account.accessTokenEnc).toBeUndefined();

    const account = await trackerRepository.findAccount("anilist");
    expect(account).toBeTruthy();
    expect(account?.accessTokenEnc).not.toContain("plain-access-token");
    expect(decryptSecret(account!.accessTokenEnc)).toBe("plain-access-token");
    expect(decryptSecret(account!.refreshTokenEnc!)).toBe("plain-refresh-token");

    const accounts = await request(app)
      .get("/api/trackers/accounts")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(accounts.body).toHaveLength(2);
    expect(accounts.body[0].provider).toBe("anilist");
    expect(accounts.body[0].connected).toBe(true);
    expect(JSON.stringify(accounts.body)).not.toContain("plain-access-token");
  });

  it("rejects a reused or unknown OAuth state", async () => {
    await request(app)
      .get("/api/trackers/anilist/auth/callback")
      .query({ code: "auth-code", state: "not-a-real-state" })
      .set("Accept", "application/json")
      .expect(400);
  });

  it("supports the MAL code-paste fallback and disconnect", async () => {
    const started = await request(app)
      .post("/api/trackers/myanimelist/auth/start")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);

    const pasted = await request(app)
      .post("/api/trackers/myanimelist/auth/code")
      .set({ Authorization: `Bearer ${token}` })
      .send({ code: "pasted-code", state: started.body.state })
      .expect(200);
    expect(pasted.body.account.connected).toBe(true);

    const disconnected = await request(app)
      .delete("/api/trackers/myanimelist")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(disconnected.body.disconnected).toBe(true);

    const accounts = await request(app)
      .get("/api/trackers/accounts")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    const mal = accounts.body.find(
      (account: { provider: string }) => account.provider === "myanimelist",
    );
    expect(mal.connected).toBe(false);
  });

  it("surfaces and clears sync errors through the status endpoint", async () => {
    await trackerRepository.saveAccount("anilist", {
      externalUserId: "7",
      username: "API Reader",
      accessTokenEnc: "v1.invalid.invalid.invalid",
      refreshTokenEnc: null,
      expiresAt: null,
    });
    await mangaRepository.create({
      id: "manga-api",
      title: "Test Manga",
      sourceId: "local",
      status: "ongoing",
      mediaType: "manga",
    });
    await chapterRepository.create({
      id: "chapter-api-1",
      mangaId: "manga-api",
      chapterId: "1",
      pagesCount: 10,
      sortOrder: 0,
    });
    await trackerRepository.upsertTracking({
      id: "track-api",
      mangaId: "manga-api",
      trackerType: "anilist",
      trackerMangaId: "555",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: null,
    });

    const status = await request(app)
      .get("/api/trackers/status")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(status.body.linkedManga).toBe(1);
    expect(status.body.accounts[0].connected).toBe(true);
  });
});

describe("manga tracking API", () => {
  async function seedLinkedManga() {
    await trackerRepository.saveAccount("anilist", {
      externalUserId: "7",
      username: "API Reader",
      accessTokenEnc: encryptSecret("token"),
      refreshTokenEnc: null,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await mangaRepository.create({
      id: "manga-api-2",
      title: "Tracked Manga",
      sourceId: "local",
      status: "ongoing",
      mediaType: "manga",
    });
    await chapterRepository.create({
      id: "chapter-api-2",
      mangaId: "manga-api-2",
      chapterId: "1",
      pagesCount: 10,
      sortOrder: 0,
    });
    provider.entries.set("555", {
      trackerMangaId: "555",
      status: "plan_to_read",
      score: null,
      chaptersRead: 0,
      totalChapters: 1,
      updatedAt: new Date(Date.now() - 10_000).toISOString(),
    });
  }

  it("lists suggestions, links, and syncs a manga", async () => {
    await seedLinkedManga();

    const suggestions = await request(app)
      .get("/api/manga/manga-api-2/tracking/search")
      .query({ provider: "anilist" })
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(suggestions.body[0].trackerMangaId).toBe("555");

    const linked = await request(app)
      .post("/api/manga/manga-api-2/tracking/link")
      .set({ Authorization: `Bearer ${token}` })
      .send({ provider: "anilist", trackerMangaId: "555" })
      .expect(200);
    expect(linked.body.trackerMangaId).toBe("555");

    const overview = await request(app)
      .get("/api/manga/manga-api-2/tracking")
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    expect(overview.body.links).toHaveLength(1);

    const push = await request(app)
      .post("/api/manga/manga-api-2/tracking/sync")
      .set({ Authorization: `Bearer ${token}` })
      .send({ provider: "anilist", direction: "push" })
      .expect(200);
    expect(push.body.state).toBe("synced");
  });

  it("returns a reconnect-required error for an unreadable token", async () => {
    await trackerRepository.saveAccount("anilist", {
      externalUserId: "7",
      username: "API Reader",
      accessTokenEnc: "not-an-encrypted-value",
      refreshTokenEnc: null,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    await mangaRepository.create({
      id: "manga-api-3",
      title: "Broken",
      sourceId: "local",
      status: "ongoing",
      mediaType: "manga",
    });
    await trackerRepository.upsertTracking({
      id: "track-api-3",
      mangaId: "manga-api-3",
      trackerType: "anilist",
      trackerMangaId: "555",
      status: "reading",
      score: null,
      chaptersRead: 0,
      remoteUpdatedAt: null,
    });

    const response = await request(app)
      .post("/api/manga/manga-api-3/tracking/sync")
      .set({ Authorization: `Bearer ${token}` })
      .send({ provider: "anilist", direction: "pull" })
      .expect(409);
    expect(response.body.reconnectRequired).toBe(true);
  });
});
