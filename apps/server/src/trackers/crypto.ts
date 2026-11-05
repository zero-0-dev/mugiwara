import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * AES-256-GCM secret storage for tracker tokens.
 *
 * The key comes from `MUGIWARA_TRACKER_ENCRYPTION_KEY` when set (any length is
 * hashed to 32 bytes). Self-hosted installs that do not configure it get a
 * generated key persisted next to the database, so restarts keep tokens
 * readable. Tokens are never logged and never returned by the API.
 */
const ALGORITHM = "aes-256-gcm";
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");
const KEY_FILE = join(DATA_DIR, "tracker.key");
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env.MUGIWARA_TRACKER_ENCRYPTION_KEY?.trim();
  if (configured) {
    cachedKey = createHash("sha256").update(configured, "utf8").digest();
    return cachedKey;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(KEY_FILE)) {
    const stored = readFileSync(KEY_FILE, "utf8").trim();
    if (stored.length > 0) {
      cachedKey = Buffer.from(stored, "base64");
      if (cachedKey.length === 32) return cachedKey;
    }
    throw new Error("Tracker encryption key file is invalid");
  }

  const generated = randomBytes(32);
  writeFileSync(KEY_FILE, generated.toString("base64"), { mode: 0o600 });
  cachedKey = generated;
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value: string): string {
  const [version, ivRaw, tagRaw, dataRaw] = value.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !dataRaw) {
    throw new Error("Unsupported encrypted secret format");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    resolveKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataRaw, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Test helper: forget the cached key after DATA_DIR changes. */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}
