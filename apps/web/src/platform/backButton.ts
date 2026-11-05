import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { isCapacitor } from "./server";

const EXIT_CONFIRMATION_MS = 2000;

interface BackButtonOptions {
  /** True when the current route is the app root (`/`). */
  isRoot: () => boolean;
  /** Navigate to `/` when there is no web history to pop. */
  onNavigateHome: () => void;
  /** The user pressed back at the root once; a second press exits. */
  onExitPrompt: () => void;
}

/**
 * Wire Android's hardware/gesture back button to web history.
 *
 * Capacitor's `canGoBack` only reflects the WebView history. We also check the
 * router's history index so an in-app deep link at index 0 can fall back to the
 * library instead of closing the app. Exiting (or minimizing) only happens on
 * a second press at the root, matching Android conventions.
 */
export function registerAndroidBackButton({
  isRoot,
  onNavigateHome,
  onExitPrompt,
}: BackButtonOptions): () => void {
  if (!isCapacitor()) return () => undefined;

  let disposed = false;
  let lastRootPress = 0;
  let handle: PluginListenerHandle | undefined;

  const subscription = App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack || canGoBackInRouter()) {
      window.history.back();
      return;
    }

    if (!isRoot()) {
      onNavigateHome();
      return;
    }

    const now = Date.now();
    if (now - lastRootPress <= EXIT_CONFIRMATION_MS) {
      void App.exitApp();
      return;
    }

    lastRootPress = now;
    onExitPrompt();
  });

  void subscription
    .then((registered) => {
      if (disposed) void registered.remove();
      else handle = registered;
    })
    .catch(() => {
      // The plugin is absent on web/older native shells; navigation still works.
    });

  return () => {
    disposed = true;
    void handle?.remove();
  };
}

function canGoBackInRouter(): boolean {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === "number" && state.idx > 0;
}
