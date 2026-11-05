import { and, eq, lt } from "drizzle-orm";

import { db, trackerAccounts, trackerOAuthStates, tracking } from "../index";

export type TrackerAccountRow = typeof trackerAccounts.$inferSelect;
export type TrackingRow = typeof tracking.$inferSelect;

export interface TrackerAccountUpdate {
  externalUserId: string;
  username: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  tokenType?: string;
  scope?: string | null;
  expiresAt: string | null;
}

export interface TrackingLinkInput {
  id: string;
  mangaId: string;
  trackerType: string;
  trackerMangaId: string;
  status: string;
  score: number | null;
  chaptersRead: number;
  remoteUpdatedAt: string | null;
  syncState?: string;
  lastPulledAt?: string | null;
}

export const trackerRepository = {
  async listAccounts(): Promise<TrackerAccountRow[]> {
    return db.query.trackerAccounts.findMany();
  },

  async findAccount(provider: string): Promise<TrackerAccountRow | undefined> {
    return db.query.trackerAccounts.findFirst({
      where: eq(trackerAccounts.provider, provider),
    });
  },

  async saveAccount(
    provider: string,
    data: TrackerAccountUpdate,
  ): Promise<TrackerAccountRow> {
    const now = new Date().toISOString();
    const values = {
      id: `${provider}-account`,
      provider,
      externalUserId: data.externalUserId,
      username: data.username,
      accessTokenEnc: data.accessTokenEnc,
      refreshTokenEnc: data.refreshTokenEnc,
      tokenType: data.tokenType ?? "Bearer",
      scope: data.scope ?? null,
      expiresAt: data.expiresAt,
      updatedAt: now,
    };
    const result = await db
      .insert(trackerAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: trackerAccounts.provider,
        set: {
          externalUserId: values.externalUserId,
          username: values.username,
          accessTokenEnc: values.accessTokenEnc,
          refreshTokenEnc: values.refreshTokenEnc,
          tokenType: values.tokenType,
          scope: values.scope,
          expiresAt: values.expiresAt,
          lastError: null,
          updatedAt: now,
        },
      })
      .returning();
    return result[0]!;
  },

  async updateAccount(
    provider: string,
    data: Partial<typeof trackerAccounts.$inferInsert>,
  ): Promise<void> {
    await db
      .update(trackerAccounts)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(trackerAccounts.provider, provider));
  },

  async deleteAccount(provider: string): Promise<void> {
    await db
      .delete(trackerAccounts)
      .where(eq(trackerAccounts.provider, provider));
  },

  async createOAuthState(data: {
    id: string;
    provider: string;
    state: string;
    codeVerifierEnc: string;
    redirectUri: string;
    expiresAt: string;
  }): Promise<void> {
    await db.insert(trackerOAuthStates).values(data);
  },

  async consumeOAuthState(
    provider: string,
    state: string,
  ): Promise<typeof trackerOAuthStates.$inferSelect | undefined> {
    const row = await db.query.trackerOAuthStates.findFirst({
      where: and(
        eq(trackerOAuthStates.state, state),
        eq(trackerOAuthStates.provider, provider),
      ),
    });
    if (!row) return undefined;
    await db
      .delete(trackerOAuthStates)
      .where(eq(trackerOAuthStates.id, row.id));
    if (Date.parse(row.expiresAt) <= Date.now()) return undefined;
    return row;
  },

  async pruneOAuthStates(): Promise<void> {
    await db
      .delete(trackerOAuthStates)
      .where(lt(trackerOAuthStates.expiresAt, new Date().toISOString()));
  },

  async findTracking(
    mangaId: string,
    provider: string,
  ): Promise<TrackingRow | undefined> {
    return db.query.tracking.findFirst({
      where: and(
        eq(tracking.mangaId, mangaId),
        eq(tracking.trackerType, provider),
      ),
    });
  },

  async listTrackingForManga(mangaId: string): Promise<TrackingRow[]> {
    return db.query.tracking.findMany({
      where: eq(tracking.mangaId, mangaId),
    });
  },

  async listAllTracking(): Promise<TrackingRow[]> {
    return db.query.tracking.findMany();
  },

  async upsertTracking(data: TrackingLinkInput): Promise<TrackingRow> {
    const now = new Date().toISOString();
    const values = {
      id: data.id,
      mangaId: data.mangaId,
      trackerType: data.trackerType,
      trackerMangaId: data.trackerMangaId,
      status: data.status,
      score: data.score,
      chaptersRead: data.chaptersRead,
      remoteUpdatedAt: data.remoteUpdatedAt,
      syncState: data.syncState ?? "synced",
      lastPulledAt: data.lastPulledAt ?? now,
      localDirty: false,
      syncError: null,
      conflict: null,
      updatedAt: now,
    };
    const result = await db
      .insert(tracking)
      .values(values)
      .onConflictDoUpdate({
        target: [tracking.mangaId, tracking.trackerType],
        set: {
          trackerMangaId: values.trackerMangaId,
          status: values.status,
          score: values.score,
          chaptersRead: values.chaptersRead,
          remoteUpdatedAt: values.remoteUpdatedAt,
          syncState: values.syncState,
          lastPulledAt: values.lastPulledAt,
          localDirty: false,
          syncError: null,
          conflict: null,
          updatedAt: now,
        },
      })
      .returning();
    return result[0]!;
  },

  async updateTracking(
    id: string,
    data: Partial<typeof tracking.$inferInsert>,
  ): Promise<void> {
    await db
      .update(tracking)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(tracking.id, id));
  },

  async deleteTracking(mangaId: string, provider: string): Promise<void> {
    await db
      .delete(tracking)
      .where(
        and(eq(tracking.mangaId, mangaId), eq(tracking.trackerType, provider)),
      );
  },

  async deleteTrackingByProvider(provider: string): Promise<void> {
    await db.delete(tracking).where(eq(tracking.trackerType, provider));
  },

  async markLocalDirty(mangaId: string, provider?: string): Promise<void> {
    await db
      .update(tracking)
      .set({
        localDirty: true,
        syncState: "pending",
        syncError: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        provider
          ? and(
              eq(tracking.mangaId, mangaId),
              eq(tracking.trackerType, provider),
            )
          : eq(tracking.mangaId, mangaId),
      );
  },
};
