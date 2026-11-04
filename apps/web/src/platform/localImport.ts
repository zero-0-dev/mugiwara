import { isCapacitor, isElectron } from "./server";

export interface LocalImportEnvironment {
  hasFolderPicker: boolean;
  context: "electron" | "capacitor" | "web";
  touchOnly: boolean;
}

function matchMediaSafe(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/**
 * Reports what the local-files UI may offer on this device. Electron can open
 * a native folder picker. Browsers and Capacitor shells cannot: the folder is
 * read by the server process, so they must type a path that exists on the
 * server machine.
 */
export function getLocalImportEnvironment(
  env: { hasFolderPicker?: boolean } = {},
): LocalImportEnvironment {
  const context = isElectron() ? "electron" : isCapacitor() ? "capacitor" : "web";
  const hasFolderPicker =
    env.hasFolderPicker ??
    (typeof window !== "undefined" &&
      typeof window.electronAPI?.selectFolder === "function");

  return {
    hasFolderPicker,
    context,
    // Hover-capable devices get keyboard hints. Touch-only devices do not.
    touchOnly: matchMediaSafe("(hover: none) and (pointer: coarse)"),
  };
}

export function getLocalPathHint(context: LocalImportEnvironment["context"]): string {
  if (context === "capacitor") {
    return "Enter a folder path on the server machine. This phone cannot browse the server's filesystem.";
  }
  if (context === "web") {
    return "Enter a folder path on the server machine, not this browser's device.";
  }
  return "Pick a folder on this computer, or type its absolute path.";
}

/**
 * Opens the Electron native folder picker. Returns null on platforms without
 * a picker or when the user cancels.
 */
export async function pickLocalFolder(): Promise<string | null> {
  const picker = typeof window !== "undefined" ? window.electronAPI?.selectFolder : undefined;
  if (typeof picker !== "function") return null;

  const selected = await picker();
  const trimmed = selected?.trim();
  return trimmed ? trimmed : null;
}

export function isLikelyLocalPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Absolute POSIX/Windows paths, home-relative paths, and anything with a
  // separator is treated as a filesystem path rather than a title search.
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    /^\\\\/.test(trimmed) ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  );
}

export function formatLocalSearchError(error: unknown, path: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw) return `Could not search "${path}".`;
  if (/no default storage backend|no storage backend/i.test(raw)) {
    return "No storage backend is configured. Open Settings → Storage, add or enable a backend, then try again.";
  }
  if (/folder not found/i.test(raw)) {
    return raw;
  }
  if (/failed to search|no such file|enoent/i.test(raw)) {
    return `Cannot read "${path}" on the server. Check that the folder exists on the server machine and that the server can read it.`;
  }
  return raw;
}

export function formatImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw) return "Import failed. Check the server logs and try again.";
  if (/no default storage backend|no storage backend/i.test(raw)) {
    return "No storage backend is configured. Open Settings → Storage, add or enable a backend, then import again.";
  }
  if (/no chapters/i.test(raw)) {
    return "No chapters were found in this folder. Add chapter subfolders, image files, or CBZ/ZIP archives, then try again.";
  }
  if (/source not found/i.test(raw)) {
    return "The selected source is no longer available. Close this dialog and choose Local Files again.";
  }
  return raw;
}
