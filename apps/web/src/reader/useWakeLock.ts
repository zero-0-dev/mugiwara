import { useEffect } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    type: "release",
    listener: () => void,
  ) => void;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keeps the screen awake while the reader is open. The lock is released on
 * unmount and re-acquired when the page becomes visible again, because the
 * browser drops it when the document is hidden.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) return; // Graceful fallback: unsupported browser/PWA.

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = async () => {
      if (disposed || sentinel || document.visibilityState !== "visible") {
        return;
      }
      try {
        const next = await wakeLock.request("screen");
        if (disposed) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        next.addEventListener("release", () => {
          sentinel = null;
        });
      } catch {
        // Denied, low power mode, or an insecure context. Reading continues.
      }
    };

    void acquire();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
        sentinel = null;
      }
    };
  }, [enabled]);
}
