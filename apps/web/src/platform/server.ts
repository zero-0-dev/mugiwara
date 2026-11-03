const SERVER_URL_KEY = "mugiwara.serverUrl";
const AUTH_TOKEN_KEY_PREFIX = "mugiwara.authToken:";

export type ResolvedServer = {
  baseUrl: string;
  label: string;
  needsSetup: boolean;
  authToken: string | null;
  contentToken: string | null;
};

export function isElectron(): boolean {
  return (
    typeof window !== "undefined" && Boolean(window.electronAPI?.getApiUrl)
  );
}

export function isCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;

  // Fallback for when the Capacitor runtime global is not available yet.
  // Capacitor serves the app from capacitor://localhost (iOS) or
  // http(s)://localhost (Android). The Vite dev server and the LAN server both
  // have a port, so this does not catch normal web usage.
  const { protocol, hostname, port } = window.location;
  return (
    protocol === "capacitor:" ||
    ((protocol === "https:" || protocol === "http:") &&
      hostname === "localhost" &&
      port === "")
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
  return normalizeServerUrl(
    stored || import.meta.env.VITE_DEFAULT_SERVER_URL || "",
  );
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

/** Key tokens by the exact server origin so two servers never share a token. */
export function getServerKey(baseUrl: string): string {
  const normalized = normalizeServerUrl(baseUrl);
  if (normalized) return normalized;
  return window.location.origin;
}

export function getStoredAuthToken(baseUrl: string): string | null {
  return window.localStorage.getItem(
    `${AUTH_TOKEN_KEY_PREFIX}${getServerKey(baseUrl)}`,
  );
}

export function saveStoredAuthToken(baseUrl: string, token: string): void {
  window.localStorage.setItem(
    `${AUTH_TOKEN_KEY_PREFIX}${getServerKey(baseUrl)}`,
    token,
  );
}

export function clearStoredAuthToken(baseUrl: string): void {
  window.localStorage.removeItem(
    `${AUTH_TOKEN_KEY_PREFIX}${getServerKey(baseUrl)}`,
  );
}

export async function testServerUrl(value: string): Promise<boolean> {
  const url = normalizeServerUrl(value);
  if (!url) return false;
  const response = await fetchWithTimeout(`${url}/api/health`, {});
  if (!response?.ok) return false;
  try {
    const body = (await response.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      credentials: "include",
    });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function isServerAuthenticated(
  baseUrl: string,
  token: string | null,
): Promise<boolean> {
  const url = normalizeServerUrl(baseUrl);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchWithTimeout(`${url}/api/auth/me`, { headers });
  return Boolean(response?.ok);
}

export async function fetchContentToken(
  baseUrl: string,
  token: string | null,
): Promise<string | null> {
  const url = normalizeServerUrl(baseUrl);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchWithTimeout(`${url}/api/auth/content-token`, {
    method: "POST",
    headers,
  });
  if (!response?.ok) return null;
  try {
    const body = (await response.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

interface PairOptions {
  baseUrl: string;
  code: string;
  deviceLabel: string;
}

export async function pairDevice({
  baseUrl,
  code,
  deviceLabel,
}: PairOptions): Promise<{ token: string }> {
  const url = normalizeServerUrl(baseUrl);
  const response = await fetchWithTimeout(`${url}/api/auth/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, deviceLabel }),
  });
  if (!response) {
    throw new Error(
      "Could not reach the server. Check the address and your network.",
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (response.status === 429) {
      throw new Error(
        "Too many pairing attempts. Wait a few minutes and try again.",
      );
    }
    throw new Error(
      body.error || "Pairing failed. Check the code and try again.",
    );
  }
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error("The server did not return a token.");
  return { token: body.token };
}

export async function validateToken(
  baseUrl: string,
  token: string,
): Promise<boolean> {
  return isServerAuthenticated(baseUrl, token);
}

export async function resolveServer(): Promise<ResolvedServer> {
  if (isElectron()) {
    const baseUrl = await window.electronAPI!.getApiUrl("");
    // Prefer the token provisioned by the main process, but fall back to a
    // token saved by the in-app pairing screen (dev/external server flows).
    const authToken =
      (await window.electronAPI!.getAuthToken()) || getStoredAuthToken(baseUrl);
    const authenticated = await isServerAuthenticated(
      baseUrl,
      authToken || null,
    );
    const contentToken = authenticated
      ? await fetchContentToken(baseUrl, authToken || null)
      : null;
    return {
      baseUrl,
      label: getServerLabel(baseUrl),
      needsSetup: !authenticated,
      authToken: authToken || null,
      contentToken,
    };
  }

  if (isCapacitor()) {
    const stored = getStoredServerUrl();
    if (!stored) {
      return {
        baseUrl: "",
        label: "",
        needsSetup: true,
        authToken: null,
        contentToken: null,
      };
    }
    const token = getStoredAuthToken(stored);
    if (!(await testServerUrl(stored))) {
      return {
        baseUrl: stored,
        label: getServerLabel(stored),
        needsSetup: true,
        authToken: token,
        contentToken: null,
      };
    }
    const authenticated = await isServerAuthenticated(stored, token);
    return {
      baseUrl: stored,
      label: getServerLabel(stored),
      needsSetup: !authenticated,
      authToken: authenticated ? token : null,
      contentToken: authenticated
        ? await fetchContentToken(stored, token)
        : null,
    };
  }

  // Browser, including the PWA served by the LAN server. The API is on the
  // same origin, so an empty base URL makes requests relative (e.g. /api/...).
  // The HttpOnly session cookie may already authenticate this browser even
  // when localStorage has no token (for example after a pairing in another tab).
  const token = getStoredAuthToken("");
  const authenticated = await isServerAuthenticated("", token);
  return {
    baseUrl: "",
    label: window.location.host,
    needsSetup: !authenticated,
    authToken: authenticated ? token : null,
    contentToken: authenticated ? await fetchContentToken("", token) : null,
  };
}
