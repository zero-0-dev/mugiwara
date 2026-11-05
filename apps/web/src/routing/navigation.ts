import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * React Router history entries carry an `idx`. Use it to go back only when the
 * app has a previous entry; a deep link starts at index 0 and must not navigate
 * out of the app (or to a blank page).
 */
export function canGoBack(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === "number" && state.idx > 0;
}

export function useBackOr(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (canGoBack()) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [fallback, navigate]);
}
