const DEVICE_ID_KEY = "mugiwara.deviceId";

let memoryDeviceId: string | null = null;

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Fallback for old WebViews without crypto.randomUUID. The value only needs
  // to be stable per browser profile, not cryptographically strong.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Stable per-browser/per-install identifier used to store reading progress
 * separately for each device. It is persisted in localStorage; if storage is
 * unavailable (private mode, restricted WebView) the id is kept in memory for
 * the lifetime of the page.
 */
export function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;

  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      memoryDeviceId = existing;
      return existing;
    }

    const created = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    memoryDeviceId = created;
    return created;
  } catch {
    memoryDeviceId = createDeviceId();
    return memoryDeviceId;
  }
}
