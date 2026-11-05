import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { isCapacitor } from "./server";

/**
 * Turn a native deep link into an app route.
 *
 * - Web/App Link: `https://server/manga/abc` -> `/manga/abc`
 * - Custom scheme: `mugiwara://manga/abc` -> `/manga/abc`
 */
export function appUrlToPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    const host = url.host ? `/${url.host}` : "";
    const pathname = url.pathname === "/" ? "" : url.pathname;
    return `${host}${pathname}${url.search}${url.hash}` || "/";
  } catch {
    return null;
  }
}

export async function getInitialDeepLinkPath(): Promise<string | null> {
  if (!isCapacitor()) return null;
  try {
    const launch = await App.getLaunchUrl();
    return launch?.url ? appUrlToPath(launch.url) : null;
  } catch {
    return null;
  }
}

export function registerDeepLinkHandler(
  onPath: (path: string) => void,
): () => void {
  if (!isCapacitor()) return () => undefined;

  let disposed = false;
  let handle: PluginListenerHandle | undefined;

  void App.addListener("appUrlOpen", ({ url }) => {
    const path = appUrlToPath(url);
    if (path) onPath(path);
  })
    .then((registered) => {
      if (disposed) void registered.remove();
      else handle = registered;
    })
    .catch(() => {
      // No native App plugin (web build); nothing to listen to.
    });

  return () => {
    disposed = true;
    void handle?.remove();
  };
}
