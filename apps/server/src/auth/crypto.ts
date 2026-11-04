import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const TOKEN_PREFIX = "mgt_";
export const CONTENT_TOKEN_SCOPE = "content";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += PAIRING_ALPHABET[randomBytes(1)[0]! % PAIRING_ALPHABET.length];
  }
  return code;
}

export function normalizePairingCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

interface ContentTokenPayload {
  v: 1;
  /** Auth token row id. Revoking the token invalidates the content token. */
  t: string;
  /** Narrow scope: content URLs only. */
  s: typeof CONTENT_TOKEN_SCOPE;
  /** Unix epoch milliseconds. */
  e: number;
}

function sign(secret: Buffer, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createContentToken(
  secret: Buffer,
  tokenId: string,
  ttlSeconds: number,
  now = Date.now(),
): { token: string; expiresAt: number } {
  const payload: ContentTokenPayload = {
    v: 1,
    t: tokenId,
    s: CONTENT_TOKEN_SCOPE,
    e: now + ttlSeconds * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const token = `${encoded}.${sign(secret, encoded)}`;
  return { token, expiresAt: payload.e };
}

export function verifyContentToken(
  secret: Buffer,
  token: string,
  now = Date.now(),
): { tokenId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts as [string, string];
  if (!encoded || !signature) return null;

  const expected = Buffer.from(sign(secret, encoded), "utf8");
  const provided = Buffer.from(signature, "utf8");
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as ContentTokenPayload;
    if (payload.v !== 1) return null;
    if (payload.s !== CONTENT_TOKEN_SCOPE) return null;
    if (typeof payload.t !== "string" || !payload.t) return null;
    if (typeof payload.e !== "number" || payload.e <= now) return null;
    return { tokenId: payload.t };
  } catch {
    return null;
  }
}
