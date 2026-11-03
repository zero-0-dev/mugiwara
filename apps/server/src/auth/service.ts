import { randomBytes, randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { authTokens } from "../database/schema";
import {
  createContentToken,
  generatePairingCode,
  generateToken,
  hashToken,
  normalizePairingCode,
  verifyContentToken,
} from "./crypto";

export interface AuthTokenRecord {
  id: string;
  deviceLabel: string;
  isAdmin: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AuthDeviceSummary extends AuthTokenRecord {
  isCurrent?: boolean;
}

export interface IssuedToken {
  token: string;
  record: AuthTokenRecord;
}

interface PairingCodeEntry {
  expiresAt: number;
  attempts: number;
}

export interface AuthServiceOptions {
  pairingTtlMs?: number;
  contentTokenTtlSeconds?: number;
  maxPairingAttempts?: number;
  /** Optional bearer-token lifetime. Null (the default) means no expiry. */
  tokenTtlMs?: number | null;
  now?: () => number;
}

const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CONTENT_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_MAX_PAIRING_ATTEMPTS = 8;
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000;

/**
 * Single-user authentication service.
 *
 * Raw tokens only ever exist in memory and in the response that issues them.
 * The database stores SHA-256 hashes plus device metadata.
 */
export class AuthService {
  private readonly db: BetterSQLite3Database<any> | any;
  private readonly pairingCodes = new Map<string, PairingCodeEntry>();
  private readonly contentSecret = randomBytes(32);
  private readonly pairingTtlMs: number;
  private readonly contentTokenTtlSeconds: number;
  private readonly maxPairingAttempts: number;
  private readonly tokenTtlMs: number | null;
  private readonly now: () => number;
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(
    db: BetterSQLite3Database<any> | any,
    options: AuthServiceOptions = {},
  ) {
    this.db = db;
    this.pairingTtlMs = options.pairingTtlMs ?? DEFAULT_PAIRING_TTL_MS;
    this.contentTokenTtlSeconds =
      options.contentTokenTtlSeconds ?? DEFAULT_CONTENT_TOKEN_TTL_SECONDS;
    this.maxPairingAttempts =
      options.maxPairingAttempts ?? DEFAULT_MAX_PAIRING_ATTEMPTS;
    this.tokenTtlMs = options.tokenTtlMs ?? null;
    this.now = options.now ?? (() => Date.now());
  }

  getContentTokenTtlSeconds(): number {
    return this.contentTokenTtlSeconds;
  }

  async countActiveTokens(): Promise<number> {
    const rows = await this.db
      .select({ id: authTokens.id })
      .from(authTokens)
      .where(isNull(authTokens.revokedAt));
    return rows.length;
  }

  async hasAnyToken(): Promise<boolean> {
    const rows = await this.db.select({ id: authTokens.id }).from(authTokens);
    return rows.length > 0;
  }

  async createToken(deviceLabel: string, isAdmin = true): Promise<IssuedToken> {
    return this.createTokenWithValue(generateToken(), deviceLabel, isAdmin);
  }

  private async createTokenWithValue(
    token: string,
    deviceLabel: string,
    isAdmin: boolean,
  ): Promise<IssuedToken> {
    const nowIso = new Date(this.now()).toISOString();
    const record: AuthTokenRecord = {
      id: randomUUID(),
      deviceLabel: sanitizeDeviceLabel(deviceLabel),
      isAdmin,
      createdAt: nowIso,
      lastUsedAt: null,
      expiresAt:
        this.tokenTtlMs === null
          ? null
          : new Date(this.now() + this.tokenTtlMs).toISOString(),
      revokedAt: null,
    };

    await this.db.insert(authTokens).values({
      id: record.id,
      tokenHash: hashToken(token),
      deviceLabel: record.deviceLabel,
      isAdmin: record.isAdmin,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });

    return { token, record };
  }

  /**
   * Provision a token supplied by an operator (for example an env var on a
   * headless/self-hosted installation). The raw value is never logged.
   */
  async ensureBootstrapToken(
    token: string,
    deviceLabel = "Bootstrap token",
  ): Promise<AuthTokenRecord | null> {
    if (!token || token.length < 24) return null;
    const tokenHash = hashToken(token);
    const existing = await this.db.query.authTokens.findFirst({
      where: eq(authTokens.tokenHash, tokenHash),
    });
    if (existing) {
      // An operator-provided bootstrap token is authoritative: refresh it if a
      // previous "log out all devices" or an old TTL left it unusable.
      const expiresAt =
        this.tokenTtlMs === null
          ? null
          : new Date(this.now() + this.tokenTtlMs).toISOString();
      if (existing.revokedAt || existing.expiresAt !== expiresAt) {
        await this.db
          .update(authTokens)
          .set({ revokedAt: null, expiresAt })
          .where(eq(authTokens.id, existing.id));
      }
      return toAuthTokenRecord({
        ...existing,
        revokedAt: null,
        expiresAt,
      });
    }
    return (await this.createTokenWithValue(token, deviceLabel, true)).record;
  }

  async authenticate(rawToken: string): Promise<AuthTokenRecord | null> {
    if (!rawToken || rawToken.length < 16) return null;
    const tokenHash = hashToken(rawToken);
    const row = await this.db.query.authTokens.findFirst({
      where: and(
        eq(authTokens.tokenHash, tokenHash),
        isNull(authTokens.revokedAt),
      ),
    });
    if (!row) return null;
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= this.now()) {
      return null;
    }

    const lastWrite = this.lastUsedWrites.get(row.id) ?? 0;
    if (this.now() - lastWrite > LAST_USED_WRITE_INTERVAL_MS) {
      const lastUsedAt = new Date(this.now()).toISOString();
      this.lastUsedWrites.set(row.id, this.now());
      await this.db
        .update(authTokens)
        .set({ lastUsedAt })
        .where(eq(authTokens.id, row.id));
      row.lastUsedAt = lastUsedAt;
    }

    return toAuthTokenRecord(row);
  }

  async findById(id: string): Promise<AuthTokenRecord | null> {
    const row = await this.db.query.authTokens.findFirst({
      where: eq(authTokens.id, id),
    });
    return row ? toAuthTokenRecord(row) : null;
  }

  async listDevices(): Promise<AuthDeviceSummary[]> {
    const rows = await this.db.select().from(authTokens);
    return rows
      .map(toAuthTokenRecord)
      .sort((a: AuthTokenRecord, b: AuthTokenRecord) =>
        b.createdAt.localeCompare(a.createdAt),
      );
  }

  async revokeToken(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing || existing.revokedAt) return false;
    await this.db
      .update(authTokens)
      .set({ revokedAt: new Date(this.now()).toISOString() })
      .where(and(eq(authTokens.id, id), isNull(authTokens.revokedAt)));
    this.lastUsedWrites.delete(id);
    return true;
  }

  async revokeAllTokens(): Promise<number> {
    const rows = await this.db
      .select({ id: authTokens.id })
      .from(authTokens)
      .where(isNull(authTokens.revokedAt));
    if (rows.length === 0) return 0;
    await this.db
      .update(authTokens)
      .set({ revokedAt: new Date(this.now()).toISOString() })
      .where(isNull(authTokens.revokedAt));
    this.lastUsedWrites.clear();
    return rows.length;
  }

  async rotateToken(
    current: AuthTokenRecord,
    deviceLabel?: string,
  ): Promise<IssuedToken> {
    const issued = await this.createToken(
      deviceLabel ?? current.deviceLabel,
      current.isAdmin,
    );
    await this.revokeToken(current.id);
    return issued;
  }

  createPairingCode(): { code: string; expiresAt: string; ttlMs: number } {
    const code = generatePairingCode();
    const expiresAt = this.now() + this.pairingTtlMs;
    this.pairingCodes.set(code, { expiresAt, attempts: 0 });
    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      ttlMs: this.pairingTtlMs,
    };
  }

  redeemPairingCode(rawCode: unknown): boolean {
    const code = normalizePairingCode(rawCode);
    if (!code) return false;
    const entry = this.pairingCodes.get(code);
    if (!entry) return false;

    if (entry.expiresAt <= this.now()) {
      this.pairingCodes.delete(code);
      return false;
    }

    entry.attempts += 1;
    if (entry.attempts > this.maxPairingAttempts) {
      this.pairingCodes.delete(code);
      return false;
    }

    // A pairing code is single-use.
    this.pairingCodes.delete(code);
    return true;
  }

  issueContentToken(tokenId: string): {
    token: string;
    expiresAt: string;
    expiresIn: number;
  } {
    const issued = createContentToken(
      this.contentSecret,
      tokenId,
      this.contentTokenTtlSeconds,
      this.now(),
    );
    return {
      token: issued.token,
      expiresAt: new Date(issued.expiresAt).toISOString(),
      expiresIn: this.contentTokenTtlSeconds,
    };
  }

  async authenticateContentToken(
    rawToken: string,
  ): Promise<AuthTokenRecord | null> {
    const payload = verifyContentToken(
      this.contentSecret,
      rawToken,
      this.now(),
    );
    if (!payload) return null;
    const token = await this.findById(payload.tokenId);
    if (!token || token.revokedAt) return null;
    return token;
  }
}

function toAuthTokenRecord(row: any): AuthTokenRecord {
  return {
    id: row.id,
    deviceLabel: row.deviceLabel,
    isAdmin: Boolean(row.isAdmin),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

function sanitizeDeviceLabel(value: unknown): string {
  const label = typeof value === "string" ? value.trim() : "";
  if (!label) return "Mugiwara device";
  return label.slice(0, 80);
}
