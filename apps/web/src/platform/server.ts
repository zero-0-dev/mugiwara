const SERVER_URL_KEY = "mugiwara.serverUrl";

export type ResolvedServer = {
  baseUrl: string;
  label: string;
  needsSetup: boolean;
};

export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.getApiUrl);
}

export function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;

  // Fallback for when the Capacitor runtime global is not available yet.
  // Capacitor serves the app from capacitor://localhost (iOS) or
  // https://localhost (Android). The Vite dev server and the LAN server both
  // have a port, so this does not catch normal web usage.
  const { protocol, hostname, port } = window.location;
  return (
    protocol === "capacitor:" ||
    (protocol === "https:" && hostname === "localhost" && port === "")
  );
}

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function getStoredServerUrl(): string {
  const stored = window.localStorage.getItem(SERVER_URL_KEY) ?? "";
  return normalizeServerUrl(stored || import.meta.env.VITE_DEFAULT_SERVER_URL || "");
}

export function saveStoredServerUrl(value: string): void {
  window.localStorage.setItem(SERVER_URL_KEY, normalizeServerUrl(value));
}

export function clearStoredServerUrl(): void {
  window.localStorage.removeItem(SERVER_URL_KEY);
}

export function getServerLabel(baseUrl: string): string {
  if (!baseUrl) return window.location.host;
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export async function testServerUrl(value: string): Promise<boolean> {
  const url = normalizeServerUrl(value);
  if (!url) return false;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function resolveServer(): Promise<ResolvedServer> {
  if (isElectron()) {
    const baseUrl = await window.electronAPI!.getApiUrl("");
    return {
      baseUrl,
      label: getServerLabel(baseUrl),
      needsSetup: false,
    };
  }

  if (isCapacitor()) {
    const stored = getStoredServerUrl();
    if (stored && (await testServerUrl(stored))) {
      return {
        baseUrl: stored,
        label: getServerLabel(stored),
        needsSetup: false,
      };
    }
    return {
      baseUrl: stored,
      label: stored ? getServerLabel(stored) : "",
      needsSetup: true,
    };
  }

  // Browser, including the PWA served by the LAN server. The API is on the
  // same origin, so an empty base URL makes requests relative (e.g. /api/...).
  return {
    baseUrl: "",
    label: window.location.host,
    needsSetup: false,
  };
}
