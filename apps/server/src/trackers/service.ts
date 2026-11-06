import type { ReadingStatus } from "@mugiwara-manga/types";
import { v4 as uuidv4 } from "uuid";

import {
  chapterRepository,
  mangaRepository,
  progressRepository,
  trackerRepository,
  type TrackerAccountRow,
  type TrackingRow,
} from "../database";
import { recordAudit } from "../services/audit";
import { getSetting } from "../services/settings";
import { normalizeBaseUrl, resolveRedirectUri } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";
import { createOAuthState, createPkcePair, errorMessage } from "./oauth";
import {
  TRACKER_PROVIDER_IDS,
  TrackerHttpError,
  isTrackerProviderId,
  statusLabel,
  type SyncDirection,
  type TrackerCandidate,
  type TrackerEntry,
  type TrackerEntryUpdate,
  type TrackerProvider,
  type TrackerProviderId,
} from "./types";

export interface TrackerServiceOptions {
  getProvider(provider: TrackerProviderId, redirectUri?: string): TrackerProvider;
  getBaseUrl(): Promise<string> | string;
  repository?: typeof trackerRepository;
  now?: () => number;
  /** Shared per-provider request gate used by every sync path. */
  rateGate?: (provider: TrackerProviderId) => Promise<void>;
  /** Called after local chapter completion changes; the sync queue debounces. */
  onLocalChange?: (mangaId: string, provider: TrackerProviderId) => void;
}

export interface TrackerAccountSummary {
  provider: TrackerProviderId;
  label: string;
  connected: boolean;
  externalUserId: string | null;
  username: string | null;
  readOnly: boolean;
  expiresAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  scoreMax: number;
}

export interface TrackerConflict {
  reason: "both_changed" | "remote_lower" | "remote_changed";
  local: {
    status: ReadingStatus;
    score: number | null;
    chaptersRead: number;
  };
  remote: {
    status: ReadingStatus;
    score: number | null;
    chaptersRead: number;
    updatedAt: string | null;
  };
}

export interface MangaTrackingLink {
  provider: TrackerProviderId;
  label: string;
  trackerMangaId: string;
  status: ReadingStatus;
  score: number | null;
  scoreMax: number;
  displayScore: number | null;
  chaptersRead: number;
  syncState: string;
  syncError: string | null;
  lastSyncedAt: string | null;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
  conflict: TrackerConflict | null;
}

export interface MangaTrackingOverview {
  mangaId: string;
  totalChapters: number;
  localChaptersRead: number;
  links: MangaTrackingLink[];
}

export interface SyncResult {
  provider: TrackerProviderId;
  mangaId: string;
  state: "synced" | "conflict";
  entry?: TrackerEntry;
  conflict?: TrackerConflict;
}

const EXPIRY_SKEW_MS = 60_000;
const TOKEN_REFRESH_FAILED =
  "Tracker session expired. Reconnect the account in Settings → Tracking.";

function isExpiring(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return false;
  return expires - now <= EXPIRY_SKEW_MS;
}

function parseConflict(value: string | null): TrackerConflict | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as TrackerConflict;
  } catch {
    return null;
  }
}

function normalizedTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

export class TrackerService {
  private readonly repository: typeof trackerRepository;
  private readonly now: () => number;
  onLocalChange?: (mangaId: string, provider: TrackerProviderId) => void;

  constructor(private readonly options: TrackerServiceOptions) {
    this.repository = options.repository ?? trackerRepository;
    this.now = options.now ?? Date.now;
    this.onLocalChange = options.onLocalChange;
  }

  setLocalChangeHandler(
    handler: (mangaId: string, provider: TrackerProviderId) => void,
  ): void {
    this.onLocalChange = handler;
  }

  private provider(
    providerId: TrackerProviderId,
    redirectUri?: string,
  ): TrackerProvider {
    return this.options.getProvider(providerId, redirectUri);
  }

  private async gate(provider: TrackerProviderId): Promise<void> {
    await this.options.rateGate?.(provider);
  }

  // ─── Accounts / OAuth ─────────────────────────────────────────────────────

  async listAccountSummaries(): Promise<TrackerAccountSummary[]> {
    const rows = await this.repository.listAccounts();
    return TRACKER_PROVIDER_IDS.map((providerId) => {
      const row = rows.find((account) => account.provider === providerId);
      return this.serializeAccount(providerId, row);
    });
  }

  private serializeAccount(
    providerId: TrackerProviderId,
    row: TrackerAccountRow | undefined,
  ): TrackerAccountSummary {
    let scoreMax: number;
    try {
      scoreMax = this.provider(providerId).scoreMax;
    } catch {
      scoreMax = providerId === "anilist" ? 100 : 10;
    }
    return {
      provider: providerId,
      label: providerId === "anilist" ? "AniList" : "MyAnimeList",
      connected: Boolean(row),
      externalUserId: row?.externalUserId ?? null,
      username: row?.username ?? null,
      readOnly: row?.readOnly ?? false,
      expiresAt: row?.expiresAt ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
      scoreMax,
    };
  }

  async startAuthorization(providerId: string, baseUrlOverride?: string): Promise<{
    provider: TrackerProviderId;
    authorizationUrl: string;
    state: string;
    redirectUri: string;
  }> {
    const provider = this.requireProviderId(providerId);
    const configured = (await getSetting("server.publicUrl"))?.trim();
    const baseUrl = configured
      ? normalizeBaseUrl(configured)
      : normalizeBaseUrl(
          baseUrlOverride ?? (await this.options.getBaseUrl()),
        );
    const redirectUri = resolveRedirectUri(provider, baseUrl);
    const impl = this.provider(provider, redirectUri);
    const state = createOAuthState();
    const pkce = createPkcePair(impl.pkceMethod);
    const expiresAt = new Date(this.now() + 10 * 60 * 1000).toISOString();

    await this.repository.pruneOAuthStates();
    await this.repository.createOAuthState({
      id: uuidv4(),
      provider,
      state,
      codeVerifierEnc: encryptSecret(pkce.verifier),
      redirectUri,
      expiresAt,
    });

    return {
      provider,
      authorizationUrl: impl.authorizationUrl({
        state,
        codeChallenge: pkce.challenge,
        redirectUri,
      }),
      state,
      redirectUri,
    };
  }

  async completeAuthorization(
    providerId: string,
    input: { code: string; state: string },
  ): Promise<TrackerAccountSummary> {
    const provider = this.requireProviderId(providerId);
    if (!input.code?.trim()) {
      throw new TrackerHttpError("Authorization code is required", {
        kind: "invalid",
      });
    }
    if (!input.state?.trim()) {
      throw new TrackerHttpError("OAuth state is required", {
        kind: "invalid",
      });
    }

    const stateRow = await this.repository.consumeOAuthState(
      provider,
      input.state.trim(),
    );
    if (!stateRow) {
      throw new TrackerHttpError(
        "This authorization link has expired or was already used. Start again.",
        { kind: "invalid" },
      );
    }

    const impl = this.provider(provider, stateRow.redirectUri);
    let verifier: string;
    try {
      verifier = decryptSecret(stateRow.codeVerifierEnc);
    } catch {
      throw new TrackerHttpError(
        "Stored OAuth verifier cannot be read. Restart the connection.",
        { kind: "invalid" },
      );
    }

    const exchanged = await impl.exchangeCode({
      code: input.code.trim(),
      codeVerifier: verifier,
      redirectUri: stateRow.redirectUri,
    });

    await this.repository.saveAccount(provider, {
      externalUserId: exchanged.user.id,
      username: exchanged.user.name,
      accessTokenEnc: encryptSecret(exchanged.tokens.accessToken),
      refreshTokenEnc: exchanged.tokens.refreshToken
        ? encryptSecret(exchanged.tokens.refreshToken)
        : null,
      tokenType: exchanged.tokens.tokenType ?? "Bearer",
      scope: exchanged.tokens.scope ?? null,
      expiresAt: exchanged.tokens.expiresAt ?? null,
    });

    recordAudit({
      event: "tracker.account.connected",
      details: { provider, username: exchanged.user.name },
    });

    return this.serializeAccount(
      provider,
      await this.repository.findAccount(provider),
    );
  }

  async disconnect(providerId: string): Promise<void> {
    const provider = this.requireProviderId(providerId);
    await this.repository.deleteAccount(provider);
    await this.repository.deleteTrackingByProvider(provider);
    recordAudit({ event: "tracker.account.disconnected", details: { provider } });
  }

  async setReadOnly(providerId: string, readOnly: boolean): Promise<void> {
    const provider = this.requireProviderId(providerId);
    const account = await this.repository.findAccount(provider);
    if (!account) {
      throw new TrackerHttpError("Tracker is not connected", { kind: "invalid" });
    }
    await this.repository.updateAccount(provider, { readOnly });
  }

  private async accessToken(
    provider: TrackerProviderId,
    options: { forceRefresh?: boolean } = {},
  ): Promise<{ account: TrackerAccountRow; token: string }> {
    const account = await this.repository.findAccount(provider);
    if (!account) {
      throw new TrackerHttpError("Tracker is not connected", {
        kind: "auth",
      });
    }

    let accessToken: string;
    try {
      accessToken = decryptSecret(account.accessTokenEnc);
    } catch {
      await this.repository.updateAccount(provider, { lastError: TOKEN_REFRESH_FAILED });
      throw new TrackerHttpError(TOKEN_REFRESH_FAILED, { kind: "auth" });
    }

    if (!options.forceRefresh && !isExpiring(account.expiresAt, this.now())) {
      return { account, token: accessToken };
    }

    if (!account.refreshTokenEnc) {
      await this.repository.updateAccount(provider, { lastError: TOKEN_REFRESH_FAILED });
      throw new TrackerHttpError(TOKEN_REFRESH_FAILED, { kind: "auth" });
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(account.refreshTokenEnc);
    } catch {
      await this.repository.updateAccount(provider, { lastError: TOKEN_REFRESH_FAILED });
      throw new TrackerHttpError(TOKEN_REFRESH_FAILED, { kind: "auth" });
    }

    try {
      await this.gate(provider);
      const refreshed = await this.provider(provider).refresh(refreshToken);
      await this.repository.updateAccount(provider, {
        accessTokenEnc: encryptSecret(refreshed.accessToken),
        refreshTokenEnc: refreshed.refreshToken
          ? encryptSecret(refreshed.refreshToken)
          : account.refreshTokenEnc,
        expiresAt: refreshed.expiresAt ?? null,
        tokenType: refreshed.tokenType ?? account.tokenType,
        scope: refreshed.scope ?? account.scope,
        lastError: null,
      });
      return {
        account: (await this.repository.findAccount(provider)) ?? account,
        token: refreshed.accessToken,
      };
    } catch (error) {
      const message =
        error instanceof TrackerHttpError && error.kind === "auth"
          ? TOKEN_REFRESH_FAILED
          : `Could not refresh tracker session: ${errorMessage(error)}`;
      await this.repository.updateAccount(provider, { lastError: message });
      throw error instanceof TrackerHttpError
        ? error
        : new TrackerHttpError(message, { kind: "auth", cause: error });
    }
  }

  // ─── Local progress helpers ───────────────────────────────────────────────

  private async localProgress(mangaId: string): Promise<{
    completedChapterIds: string[];
    chaptersRead: number;
    totalChapters: number;
  }> {
    const chapters = await chapterRepository.findByMangaId(mangaId);
    const progress = await progressRepository.findAllByMangaId(mangaId);
    const completed = new Set(
      progress
        .filter(
          (row) =>
            row.chapterId &&
            (row.isCompleted || row.percentComplete >= 95),
        )
        .map((row) => row.chapterId as string),
    );
    const completedInLibrary = chapters
      .filter((chapter) => completed.has(chapter.id))
      .map((chapter) => chapter.id);
    return {
      completedChapterIds: completedInLibrary,
      chaptersRead: completedInLibrary.length,
      totalChapters: chapters.length,
    };
  }

  private async markFirstChaptersComplete(
    mangaId: string,
    count: number,
  ): Promise<void> {
    const chapters = await chapterRepository.findByMangaId(mangaId);
    const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = Math.max(0, Math.min(Math.floor(count), ordered.length));
    if (target === 0) return;
    await progressRepository.markChaptersComplete(
      mangaId,
      ordered.slice(0, target).map((chapter) => chapter.id),
      true,
    );
  }

  private async setCompletedChapters(mangaId: string, count: number): Promise<void> {
    const chapters = await chapterRepository.findByMangaId(mangaId);
    const ordered = [...chapters].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = Math.max(0, Math.min(Math.floor(count), ordered.length));
    if (target > 0) {
      await progressRepository.markChaptersComplete(
        mangaId,
        ordered.slice(0, target).map((chapter) => chapter.id),
        true,
      );
    }
    const remaining = ordered.slice(target).map((chapter) => chapter.id);
    if (remaining.length > 0) {
      await progressRepository.clearChapterProgress(mangaId, remaining);
    }
  }

  private deriveStatus(
    current: ReadingStatus,
    chaptersRead: number,
    totalChapters: number,
  ): ReadingStatus {
    if (totalChapters > 0 && chaptersRead >= totalChapters) return "completed";
    if (current === "plan_to_read" && chaptersRead > 0) return "reading";
    if (current === "completed" && totalChapters > 0 && chaptersRead < totalChapters) {
      return "reading";
    }
    return current;
  }

  // ─── Linking ──────────────────────────────────────────────────────────────

  async suggestCandidates(
    mangaId: string,
    providerId: string,
    query?: string,
  ): Promise<Array<TrackerCandidate & { confidence: number }>> {
    const provider = this.requireProviderId(providerId);
    const manga = await mangaRepository.findById(mangaId);
    if (!manga) {
      throw new TrackerHttpError("Manga not found", { kind: "invalid" });
    }

    const results: Array<TrackerCandidate & { confidence: number }> = [];
    // Existing AniList metadata is the strongest possible match and works
    // without a search request.
    if (provider === "anilist" && manga.anilistId) {
      results.push({
        trackerMangaId: String(manga.anilistId),
        title: manga.title,
        altTitles: manga.altTitles ?? [],
        year: null,
        chapters: null,
        coverImage: null,
        confidence: 1,
      });
    }

    let candidates: TrackerCandidate[];
    try {
      const { token } = await this.accessToken(provider);
      await this.gate(provider);
      candidates = await this.provider(provider).search(
        token,
        query?.trim() || manga.title,
      );
    } catch {
      // Suggestions are best-effort. Linking still works manually.
      candidates = [];
    }

    const normalized = normalizedTitle(manga.title);
    for (const candidate of candidates) {
      const titles = [candidate.title, ...candidate.altTitles];
      const best = Math.max(
        ...titles.map((title) => similarity(normalized, normalizedTitle(title))),
        0,
      );
      const already = results.find(
        (result) => result.trackerMangaId === candidate.trackerMangaId,
      );
      if (already) {
        already.confidence = Math.max(already.confidence, best);
        continue;
      }
      results.push({ ...candidate, confidence: Math.round(best * 100) / 100 });
    }

    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
  }

  async searchCandidates(
    providerId: string,
    query: string,
  ): Promise<TrackerCandidate[]> {
    const provider = this.requireProviderId(providerId);
    if (!query.trim()) return [];
    const { token } = await this.accessToken(provider);
    await this.gate(provider);
    return this.provider(provider).search(token, query.trim());
  }

  async link(
    mangaId: string,
    providerId: string,
    trackerMangaId: string,
  ): Promise<MangaTrackingLink> {
    const provider = this.requireProviderId(providerId);
    const manga = await mangaRepository.findById(mangaId);
    if (!manga) {
      throw new TrackerHttpError("Manga not found", { kind: "invalid" });
    }
    if (!trackerMangaId.trim()) {
      throw new TrackerHttpError("A tracker manga id is required", {
        kind: "invalid",
      });
    }

    const { token } = await this.accessToken(provider);
    let remote: TrackerEntry | null;
    try {
      await this.gate(provider);
      remote = await this.provider(provider).getEntry(token, trackerMangaId);
    } catch {
      remote = null;
    }

    const local = await this.localProgress(mangaId);
    const status = remote?.status ?? this.deriveStatus("reading", local.chaptersRead, local.totalChapters);
    const link = await this.repository.upsertTracking({
      id: uuidv4(),
      mangaId,
      trackerType: provider,
      trackerMangaId: trackerMangaId.trim(),
      status,
      score: remote?.score ?? null,
      chaptersRead: remote?.chaptersRead ?? local.chaptersRead,
      remoteUpdatedAt: remote?.updatedAt ?? null,
      syncState: "synced",
      lastPulledAt: new Date(this.now()).toISOString(),
    });

    const remoteLower = local.chaptersRead > (remote?.chaptersRead ?? 0);
    if (remoteLower) {
      await this.repository.updateTracking(link.id, {
        localDirty: true,
        syncState: "pending",
      });
      this.onLocalChange?.(mangaId, provider);
    }

    recordAudit({
      event: "tracker.manga.linked",
      details: {
        mangaId,
        provider,
        trackerMangaId: trackerMangaId.trim(),
      },
    });
    return this.toLink(link, local);
  }

  async unlink(mangaId: string, providerId: string): Promise<void> {
    const provider = this.requireProviderId(providerId);
    await this.repository.deleteTracking(mangaId, provider);
  }

  async getOverview(mangaId: string): Promise<MangaTrackingOverview> {
    const local = await this.localProgress(mangaId);
    const rows = await this.repository.listTrackingForManga(mangaId);
    return {
      mangaId,
      totalChapters: local.totalChapters,
      localChaptersRead: local.chaptersRead,
      links: rows
        .filter((row): row is TrackingRow & { trackerType: TrackerProviderId } =>
          isTrackerProviderId(row.trackerType),
        )
        .map((row) => this.toLink(row, local)),
    };
  }

  private toLink(
    row: TrackingRow,
    local: { chaptersRead: number; totalChapters: number },
  ): MangaTrackingLink {
    const providerId = row.trackerType as TrackerProviderId;
    let scoreMax = providerId === "anilist" ? 100 : 10;
    try {
      scoreMax = this.provider(providerId).scoreMax;
    } catch {
      // Fall back to the provider's static scale.
    }
    return {
      provider: providerId,
      label: providerId === "anilist" ? "AniList" : "MyAnimeList",
      trackerMangaId: row.trackerMangaId,
      status: row.status as ReadingStatus,
      score: row.score,
      scoreMax,
      displayScore:
        row.score == null ? null : Math.round((row.score / scoreMax) * 100) / 10,
      chaptersRead: local.chaptersRead,
      syncState: row.syncState,
      syncError: row.syncError,
      lastSyncedAt: row.lastSyncedAt,
      lastPushedAt: row.lastPushedAt,
      lastPulledAt: row.lastPulledAt,
      conflict: parseConflict(row.conflict),
    };
  }

  // ─── Push / pull ──────────────────────────────────────────────────────────

  private buildConflict(
    row: TrackingRow,
    remote: TrackerEntry,
    local: { chaptersRead: number },
    reason: TrackerConflict["reason"],
  ): TrackerConflict {
    return {
      reason,
      local: {
        status: row.status as ReadingStatus,
        score: row.score,
        chaptersRead: local.chaptersRead,
      },
      remote: {
        status: remote.status,
        score: remote.score,
        chaptersRead: remote.chaptersRead,
        updatedAt: remote.updatedAt,
      },
    };
  }

  private remoteChanged(row: TrackingRow, remote: TrackerEntry): boolean {
    if (!remote.updatedAt) return false;
    if (!row.remoteUpdatedAt) return true;
    return Date.parse(remote.updatedAt) > Date.parse(row.remoteUpdatedAt);
  }

  private async persistConflict(
    row: TrackingRow,
    conflict: TrackerConflict,
  ): Promise<SyncResult> {
    await this.repository.updateTracking(row.id, {
      syncState: "conflict",
      conflict: JSON.stringify(conflict),
      syncError: "Local and remote progress changed. Choose which to keep.",
      lastPulledAt: new Date(this.now()).toISOString(),
    });
    return {
      provider: row.trackerType as TrackerProviderId,
      mangaId: row.mangaId,
      state: "conflict",
      conflict,
    };
  }

  async push(
    mangaId: string,
    providerId: string,
    options: { force?: boolean } = {},
  ): Promise<SyncResult> {
    const provider = this.requireProviderId(providerId);
    const row = await this.repository.findTracking(mangaId, provider);
    if (!row) {
      throw new TrackerHttpError("This manga is not linked to the tracker", {
        kind: "invalid",
      });
    }
    const account = await this.repository.findAccount(provider);
    if (!account) {
      throw new TrackerHttpError("Tracker is not connected", { kind: "auth" });
    }
    if (account.readOnly) {
      throw new TrackerHttpError(
        "This account is in read-only mode. Enable two-way sync first.",
        { kind: "invalid" },
      );
    }

    const { token } = await this.accessToken(provider);
    const impl = this.provider(provider);
    const local = await this.localProgress(mangaId);

    let remote: TrackerEntry | null;
    try {
      await this.gate(provider);
      remote = await impl.getEntry(token, row.trackerMangaId);
    } catch (error) {
      if (error instanceof TrackerHttpError && error.status === 404) {
        remote = null;
      } else {
        throw error;
      }
    }

    if (!options.force && remote && row.localDirty && this.remoteChanged(row, remote)) {
      return this.persistConflict(
        row,
        this.buildConflict(row, remote, local, "both_changed"),
      );
    }

    const targetStatus = this.deriveStatus(
      row.status as ReadingStatus,
      local.chaptersRead,
      local.totalChapters,
    );
    const update: TrackerEntryUpdate = {
      status: targetStatus,
      score: row.score,
      chaptersRead: local.chaptersRead,
      totalChapters: local.totalChapters,
    };

    try {
      await this.gate(provider);
      const result = await impl.updateEntry(token, row.trackerMangaId, update);
      const now = new Date(this.now()).toISOString();
      await this.repository.updateTracking(row.id, {
        status: result.status,
        score: result.score,
        chaptersRead: result.chaptersRead,
        lastPushedAt: now,
        lastPulledAt: now,
        lastSyncedAt: now,
        remoteUpdatedAt: result.updatedAt ?? now,
        localDirty: false,
        syncState: "synced",
        syncError: null,
        conflict: null,
      });
      return {
        provider,
        mangaId,
        state: "synced",
        entry: result,
      };
    } catch (error) {
      await this.recordSyncError(row, error);
      throw error;
    }
  }

  async pull(
    mangaId: string,
    providerId: string,
    options: { force?: boolean } = {},
  ): Promise<SyncResult> {
    const provider = this.requireProviderId(providerId);
    const row = await this.repository.findTracking(mangaId, provider);
    if (!row) {
      throw new TrackerHttpError("This manga is not linked to the tracker", {
        kind: "invalid",
      });
    }
    const { token } = await this.accessToken(provider);
    const local = await this.localProgress(mangaId);

    let remote: TrackerEntry | null;
    try {
      await this.gate(provider);
      remote = await this.provider(provider).getEntry(token, row.trackerMangaId);
    } catch (error) {
      await this.recordSyncError(row, error);
      throw error;
    }
    if (!remote) {
      const error = new TrackerHttpError(
        "The linked tracker entry no longer exists. Link a different entry.",
        { kind: "invalid" },
      );
      await this.recordSyncError(row, error);
      throw error;
    }

    if (
      !options.force &&
      row.localDirty &&
      this.remoteChanged(row, remote)
    ) {
      return this.persistConflict(
        row,
        this.buildConflict(row, remote, local, "both_changed"),
      );
    }
    if (
      !options.force &&
      remote.chaptersRead < local.chaptersRead
    ) {
      return this.persistConflict(
        row,
        this.buildConflict(row, remote, local, "remote_lower"),
      );
    }

    await this.applyRemote(row, remote, local);
    return { provider, mangaId, state: "synced", entry: remote };
  }

  private async applyRemote(
    row: TrackingRow,
    remote: TrackerEntry,
    local: { chaptersRead: number },
  ): Promise<void> {
    if (remote.chaptersRead > local.chaptersRead) {
      await this.markFirstChaptersComplete(row.mangaId, remote.chaptersRead);
    } else if (remote.chaptersRead < local.chaptersRead) {
      // Reached only through an explicit "use remote" conflict resolution;
      // ordinary pulls with a lower remote count are reported as conflicts.
      await this.setCompletedChapters(row.mangaId, remote.chaptersRead);
    }
    const now = new Date(this.now()).toISOString();
    await this.repository.updateTracking(row.id, {
      status: remote.status,
      score: remote.score,
      chaptersRead: remote.chaptersRead,
      lastPulledAt: now,
      lastSyncedAt: now,
      remoteUpdatedAt: remote.updatedAt ?? now,
      localDirty: false,
      syncState: "synced",
      syncError: null,
      conflict: null,
    });
  }

  async syncOne(
    mangaId: string,
    providerId: string,
    direction: SyncDirection,
    options: { force?: boolean } = {},
  ): Promise<SyncResult> {
    return direction === "push"
      ? this.push(mangaId, providerId, options)
      : this.pull(mangaId, providerId, options);
  }

  async resolveConflict(
    mangaId: string,
    providerId: string,
    resolution: "local" | "remote",
  ): Promise<SyncResult> {
    const provider = this.requireProviderId(providerId);
    const row = await this.repository.findTracking(mangaId, provider);
    if (!row) {
      throw new TrackerHttpError("This manga is not linked to the tracker", {
        kind: "invalid",
      });
    }
    if (resolution === "local") {
      return this.push(mangaId, provider, { force: true });
    }
    return this.pull(mangaId, provider, { force: true });
  }

  private async recordSyncError(row: TrackingRow, error: unknown): Promise<void> {
    const message =
      error instanceof TrackerHttpError && error.kind === "rate_limit"
        ? "Tracker rate limit hit. Mugiwara will retry automatically."
        : errorMessage(error);
    await this.repository.updateTracking(row.id, {
      syncState: "error",
      syncError: message,
    });
    if (row.trackerType && isTrackerProviderId(row.trackerType)) {
      const account = await this.repository.findAccount(row.trackerType);
      if (account) {
        await this.repository.updateAccount(row.trackerType, {
          lastError:
            error instanceof TrackerHttpError && error.kind === "auth"
              ? TOKEN_REFRESH_FAILED
              : message,
        });
      }
    }
  }

  /** Mark local links dirty and let the debounced queue push them. */
  async noteChapterProgress(mangaId: string): Promise<void> {
    const rows = await this.repository.listTrackingForManga(mangaId);
    if (rows.length === 0) return;
    const accounts = await this.repository.listAccounts();
    for (const row of rows) {
      if (!isTrackerProviderId(row.trackerType)) continue;
      const account = accounts.find(
        (item) => item.provider === row.trackerType,
      );
      if (!account || account.readOnly) continue;
      await this.repository.markLocalDirty(mangaId, row.trackerType);
      this.onLocalChange?.(mangaId, row.trackerType);
    }
  }

  async syncAll(
    options: { direction?: SyncDirection } = {},
  ): Promise<{ pushed: number; pulled: number; failed: number }> {
    const direction = options.direction ?? "pull";
    const rows = await this.repository.listAllTracking();
    let pushed = 0;
    let pulled = 0;
    let failed = 0;
    for (const row of rows) {
      if (!isTrackerProviderId(row.trackerType)) continue;
      const account = await this.repository.findAccount(row.trackerType);
      if (!account) continue;
      try {
        if (direction === "push" && account.readOnly) continue;
        await this.syncOne(row.mangaId, row.trackerType, direction);
        if (direction === "push") pushed += 1;
        else pulled += 1;
      } catch {
        failed += 1;
      }
    }
    return { pushed, pulled, failed };
  }

  async pullAll(): Promise<{ pulled: number; failed: number }> {
    const result = await this.syncAll({ direction: "pull" });
    return { pulled: result.pulled, failed: result.failed };
  }

  /**
   * Pull-only mode can run without any links by importing the provider list,
   * but this vertical slice keeps import scoped to linked manga so a mis-match
   * can never overwrite an unrelated local title.
   */
  async listRemoteEntries(
    providerId: string,
  ): Promise<Array<TrackerEntry & { label: string }>> {
    const provider = this.requireProviderId(providerId);
    const { account, token } = await this.accessToken(provider);
    await this.gate(provider);
    const entries = await this.provider(provider).list(
      token,
      account.externalUserId,
    );
    return entries.map((entry) => ({
      ...entry,
      label: `${statusLabel(entry.status)} · ${entry.chaptersRead}`,
    }));
  }

  async updateLink(
    mangaId: string,
    providerId: string,
    input: { status?: string; score?: number | null },
  ): Promise<MangaTrackingLink> {
    const provider = this.requireProviderId(providerId);
    const row = await this.repository.findTracking(mangaId, provider);
    if (!row) {
      throw new TrackerHttpError("This manga is not linked to the tracker", {
        kind: "invalid",
      });
    }
    const impl = this.provider(provider);
    const updates: Partial<typeof row> = {};
    if (input.status !== undefined) {
      const statuses = [
        "reading",
        "completed",
        "on_hold",
        "dropped",
        "plan_to_read",
      ];
      if (!statuses.includes(input.status)) {
        throw new TrackerHttpError("Invalid reading status", {
          kind: "invalid",
        });
      }
      updates.status = input.status;
    }
    if (input.score !== undefined) {
      if (
        input.score != null &&
        (!Number.isFinite(input.score) || input.score < 0 || input.score > impl.scoreMax)
      ) {
        throw new TrackerHttpError(
          `Score must be between 0 and ${impl.scoreMax}`,
          { kind: "invalid" },
        );
      }
      updates.score = input.score == null ? null : Math.round(input.score);
    }
    await this.repository.updateTracking(row.id, {
      ...updates,
      localDirty: true,
      syncState: "pending",
      syncError: null,
    });
    this.onLocalChange?.(mangaId, provider);
    const updated = await this.repository.findTracking(mangaId, provider);
    const local = await this.localProgress(mangaId);
    return this.toLink(updated ?? row, local);
  }

  private requireProviderId(value: string): TrackerProviderId {
    if (!isTrackerProviderId(value)) {
      throw new TrackerHttpError(`Unknown tracker provider: ${value}`, {
        kind: "invalid",
      });
    }
    return value;
  }
}
