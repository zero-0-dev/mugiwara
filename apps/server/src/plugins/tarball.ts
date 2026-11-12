import { promises as fs } from "node:fs";
import * as path from "node:path";
import { gunzipSync } from "node:zlib";

import { PluginInstallError } from "./errors";

const BLOCK_SIZE = 512;
// Compressed uploads are capped by the HTTP route; these limits guard the
// decompressed archive against gzip bombs and oversized plugin payloads.
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

const FILE_TYPES = new Set(["0", "7"]);

export interface TarballPackageJson {
  name?: unknown;
  version?: unknown;
  dependencies?: Record<string, string>;
  mugiwara?: { type?: unknown; id?: unknown; compatibleCore?: unknown };
  [key: string]: unknown;
}

export interface TarballPackage {
  packageJson: TarballPackageJson;
  /** POSIX directory that contains package.json, or "" for an archive root. */
  directory: string;
}

interface TarEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  offset: number;
}

function invalid(message: string): PluginInstallError {
  return new PluginInstallError(message, 400, "invalid_plugin_tarball");
}

function isGzip(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function decompress(buffer: Buffer): Buffer {
  if (!isGzip(buffer)) return buffer;
  try {
    return gunzipSync(buffer, { maxOutputLength: MAX_ARCHIVE_BYTES });
  } catch (error) {
    throw invalid(
      `Plugin tarball could not be decompressed: ${
        error instanceof Error ? error.message : "unknown gzip error"
      }`,
    );
  }
}

function isZeroBlock(block: Buffer): boolean {
  for (const byte of block) {
    if (byte !== 0) return false;
  }
  return true;
}

function readString(data: Buffer, offset: number, length: number): string {
  const slice = data.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return (end === -1 ? slice : slice.subarray(0, end)).toString("utf8");
}

function readNumeric(data: Buffer, offset: number, length: number): number {
  const field = data.subarray(offset, offset + length);
  // GNU tar stores very large values in base-256 with the high bit set.
  if (field[0] !== undefined && (field[0] & 0x80) !== 0) {
    let value = 0;
    for (let index = 1; index < field.length; index += 1) {
      value = value * 256 + field[index]!;
    }
    return value;
  }
  const text = readString(data, offset, length).trim();
  if (!text) return 0;
  const parsed = Number.parseInt(text, 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function verifyChecksum(header: Buffer): void {
  const stored = readNumeric(header, 148, 8);
  let sum = 0;
  for (let index = 0; index < BLOCK_SIZE; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index]!;
  }
  if (stored !== sum) {
    throw invalid(
      "Plugin tarball has an invalid header checksum. Only .tar and .tar.gz archives are supported.",
    );
  }
}

function parsePaxRecords(content: Buffer): Record<string, string> {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < content.length) {
    const space = content.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number.parseInt(
      content.subarray(offset, space).toString("ascii"),
      10,
    );
    if (
      !Number.isFinite(length) ||
      length <= 0 ||
      offset + length > content.length
    ) {
      break;
    }
    const record = content
      .subarray(space + 1, offset + length - 1)
      .toString("utf8");
    const separator = record.indexOf("=");
    if (separator > 0) {
      records[record.slice(0, separator)] = record.slice(separator + 1);
    }
    offset += length;
  }
  return records;
}

function normalizeEntryPath(rawName: string): string | null {
  const name = rawName
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .trim();
  if (!name || name === ".") return null;
  if (name.includes("\0")) {
    throw invalid(
      "Plugin tarball contains an entry with a NUL byte in its path.",
    );
  }
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    throw invalid(
      `Plugin tarball contains an absolute path ("${rawName}"), which is not allowed.`,
    );
  }
  const normalized = path.posix.normalize(name).replace(/\/+$/, "");
  if (
    !normalized ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw invalid(
      `Plugin tarball contains an unsafe path ("${rawName}"), which is not allowed.`,
    );
  }
  return normalized;
}

function parseTarEntries(data: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let zeroBlocks = 0;
  let longName: string | null = null;
  let pax: Record<string, string> = {};
  let totalBytes = 0;

  while (offset + BLOCK_SIZE <= data.length) {
    const header = data.subarray(offset, offset + BLOCK_SIZE);
    offset += BLOCK_SIZE;

    if (isZeroBlock(header)) {
      zeroBlocks += 1;
      if (zeroBlocks >= 2) break;
      continue;
    }
    zeroBlocks = 0;
    verifyChecksum(header);

    const typeflag =
      header[156] === 0 ? "0" : String.fromCharCode(header[156]!);
    const nameField = readString(header, 0, 100);
    const prefixField = readString(header, 345, 155);
    const magic = readString(header, 257, 6);
    let name =
      magic.startsWith("ustar") && prefixField
        ? `${prefixField}/${nameField}`
        : nameField;
    const size = readNumeric(header, 124, 12);
    const contentOffset = offset;

    if (size > MAX_ENTRY_BYTES) {
      throw invalid(
        `Plugin tarball entry "${name || "(unnamed)"}" is larger than ${
          MAX_ENTRY_BYTES / (1024 * 1024)
        } MB.`,
      );
    }
    if (contentOffset + size > data.length) {
      throw invalid("Plugin tarball is truncated or corrupt.");
    }
    const content = data.subarray(contentOffset, contentOffset + size);
    offset = contentOffset + Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    if (typeflag === "x" || typeflag === "X") {
      pax = { ...pax, ...parsePaxRecords(content) };
      continue;
    }
    if (typeflag === "g") continue;
    if (typeflag === "L") {
      longName = readString(content, 0, content.length);
      continue;
    }
    if (typeflag === "K") continue;

    if (pax.path) name = pax.path;
    if (longName !== null) name = longName;
    pax = {};
    longName = null;

    const isDirectory = typeflag === "5" || name.endsWith("/");
    if (!isDirectory && !FILE_TYPES.has(typeflag)) {
      throw invalid(
        `Plugin tarball contains an unsupported entry type ("${typeflag}") for "${name}". Symlinks, hard links and device files are not allowed.`,
      );
    }

    const normalizedName = normalizeEntryPath(name);
    if (!normalizedName) continue;

    entries.push({
      name: normalizedName,
      type: isDirectory ? "directory" : "file",
      size: isDirectory ? 0 : size,
      offset: contentOffset,
    });
    if (entries.length > MAX_ENTRIES) {
      throw invalid(
        `Plugin tarball contains more than ${MAX_ENTRIES} entries.`,
      );
    }
    if (!isDirectory) {
      totalBytes += size;
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        throw invalid(
          `Plugin tarball expands to more than ${
            MAX_ARCHIVE_BYTES / (1024 * 1024)
          } MB.`,
        );
      }
    }
  }

  return entries;
}

function isPackageJsonPath(name: string): boolean {
  return name === "package.json" || name.endsWith("/package.json");
}

/**
 * Reads the package.json that identifies a plugin tarball. The archive is
 * parsed in memory only; nothing is written here, so a hostile path cannot
 * touch the filesystem during validation.
 */
export function readPackageJsonFromTarball(buffer: Buffer): TarballPackage {
  if (buffer.length === 0) {
    throw invalid("Plugin tarball is empty.");
  }
  const data = decompress(buffer);
  const entries = parseTarEntries(data);
  const candidates = entries
    .filter((entry) => entry.type === "file" && isPackageJsonPath(entry.name))
    .sort(
      (left, right) =>
        left.name.split("/").length - right.name.split("/").length,
    );

  const chosen = candidates[0];
  if (!chosen) {
    throw invalid(
      'Plugin tarball does not contain a package.json. Create it with "npm pack" so the archive contains package/package.json.',
    );
  }

  const raw = data
    .subarray(chosen.offset, chosen.offset + chosen.size)
    .toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid(
      `Plugin tarball contains an invalid package.json (${chosen.name}).`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid(
      `Plugin tarball contains an invalid package.json (${chosen.name}).`,
    );
  }

  const directory = path.posix.dirname(chosen.name);
  return {
    packageJson: parsed as TarballPackageJson,
    directory: directory === "." ? "" : directory,
  };
}

/**
 * Extracts a .tar or .tar.gz archive into `destination`. Every entry is
 * validated before the first byte is written, and unsafe paths or special
 * files abort the whole extraction.
 */
export async function extractTarball(
  buffer: Buffer,
  destination: string,
): Promise<void> {
  const data = decompress(buffer);
  const entries = parseTarEntries(data);
  const root = path.resolve(destination);

  for (const entry of entries) {
    const target = path.resolve(root, ...entry.name.split("/"));
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      throw invalid(
        `Plugin tarball entry "${entry.name}" escapes the extraction directory.`,
      );
    }
  }

  for (const entry of entries) {
    const target = path.resolve(root, ...entry.name.split("/"));
    if (entry.type === "directory") {
      await fs.mkdir(target, { recursive: true, mode: 0o755 });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
    await fs.writeFile(
      target,
      data.subarray(entry.offset, entry.offset + entry.size),
      {
        mode: 0o644,
      },
    );
  }
}
