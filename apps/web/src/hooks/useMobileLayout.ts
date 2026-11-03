import { useEffect, useState } from "react";

export const MOBILE_LAYOUT_QUERY =
  "(max-width: 900px), (pointer: coarse), (max-height: 500px)";

/** Mirrors the CSS mobile/touch breakpoint in index.css. */
export function useMobileLayout(): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return matches;
}
