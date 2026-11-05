import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const SCROLL_KEY_PREFIX = "mugiwara.scroll:";
const RESTORE_ATTEMPTS = 12;

function readScroll(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(`${SCROLL_KEY_PREFIX}${key}`);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeScroll(key: string, value: number): void {
  try {
    window.sessionStorage.setItem(
      `${SCROLL_KEY_PREFIX}${key}`,
      String(Math.max(0, Math.round(value))),
    );
  } catch {
    // Private mode: scrolling still works, it just is not restored.
  }
}

/**
 * Scroll restoration for the app's own scroll container.
 *
 * React Router's <ScrollRestoration> only manages the window, while Mugiwara
 * scrolls inside <main>. Entries are keyed by history key so POP restores the
 * exact offset while PUSH/REPLACE starts at the top. Async screens (the
 * library query, the chapter list) can grow after the first frame, so the
 * restore is retried briefly until the container is tall enough.
 */
export function useScrollRestoration(
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const restoreFrame = useRef<number | null>(null);

  const cancelRestore = useCallback(() => {
    if (restoreFrame.current !== null) {
      cancelAnimationFrame(restoreFrame.current);
      restoreFrame.current = null;
    }
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const key = location.key;
    const save = () => writeScroll(key, element.scrollTop);
    element.addEventListener("scroll", save, { passive: true });
    return () => {
      element.removeEventListener("scroll", save);
    };
  }, [containerRef, location.key]);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    cancelRestore();
    if (navigationType === "REPLACE") return;
    const target = navigationType === "POP" ? readScroll(location.key) : 0;
    if (target === null || target === 0) {
      element.scrollTop = 0;
      return;
    }

    let attempt = 0;
    const restore = () => {
      element.scrollTop = target;
      attempt += 1;
      const settled = Math.abs(element.scrollTop - target) <= 1;
      if (!settled && attempt < RESTORE_ATTEMPTS) {
        restoreFrame.current = requestAnimationFrame(restore);
      } else {
        restoreFrame.current = null;
      }
    };
    restore();

    return cancelRestore;
  }, [cancelRestore, containerRef, location.key, navigationType]);
}
