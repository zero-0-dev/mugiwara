import React, { useCallback, useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { ServerSetup } from "./components/ServerSetup";
import { useSettings } from "./api/hooks";
import { ApiClientProvider } from "./api/context";
import { ToastProvider } from "./components/Toast";
import { Button } from "./components/ui/button";
import { AppChromeProvider } from "./routing/appChrome";
import { createAppRouter } from "./routing/routes";
import brandMark from "./assets/mugiwara-mark.png";
import { cn } from "./lib/utils";
import {
  clearStoredAuthToken,
  getStoredServerUrl,
  isCapacitor,
  resolveServer,
  saveStoredAuthToken,
  saveStoredServerUrl,
} from "./platform/server";

export const THEME_STORAGE_KEY = "mugiwara.theme";

/** Keeps the browser theme-color and the native system bars in sync. */
function applyThemeChrome(theme: string) {
  const isDark = theme !== "light";
  document.documentElement.dataset.theme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", isDark ? "#171717" : "#f4f1ed");

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the UI still works.
  }

  if (isCapacitor()) {
    void SystemBars.setStyle({
      style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => {
      // The browser and older native shells do not register this plugin.
    });
  }
}

function ThemeApplier() {
  const { data: settings } = useSettings();
  const theme = (settings as Record<string, string> | undefined)?.["ui.theme"];

  useEffect(() => {
    if (!theme) return;
    applyThemeChrome(theme);
  }, [theme]);

  return null;
}

function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={brandMark}
      alt=""
      aria-hidden="true"
      className={cn(
        "size-8 shrink-0 rounded-lg object-cover shadow-sm shadow-orange-950/40",
        className,
      )}
    />
  );
}

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [contentToken, setContentToken] = useState<string | null>(null);
  const [serverLabel, setServerLabel] = useState<string>("");
  const [needsServerSetup, setNeedsServerSetup] = useState(false);
  const [showServerSetup, setShowServerSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [router] = useState(() => createAppRouter());
  const canChangeServer = isCapacitor();

  useEffect(() => {
    async function init() {
      try {
        const resolved = await resolveServer();
        setApiBaseUrl(resolved.baseUrl);
        setAuthToken(resolved.authToken);
        setContentToken(resolved.contentToken);
        setServerLabel(resolved.label);
        setNeedsServerSetup(resolved.needsSetup);
        setLoading(false);
      } catch {
        setError("Failed to connect to server");
        setLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredAuthToken(apiBaseUrl);
      setAuthToken(null);
      setContentToken(null);
      setNeedsServerSetup(true);
    };
    window.addEventListener("mugiwara:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("mugiwara:unauthorized", handleUnauthorized);
  }, [apiBaseUrl]);

  const handleServerConnected = (url: string, token: string) => {
    saveStoredAuthToken(url, token);
    saveStoredServerUrl(url);
    // Reload so every query and the API client start from the new origin. The
    // current path and query string survive, so a deep link stays deep.
    window.location.reload();
  };

  const handleChangeServer = useCallback(() => {
    setShowServerSetup(true);
  }, []);

  if (loading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground">
        <BrandMark className="size-12 rounded-2xl" />
        <div className="loading-spinner" />
        <p className="text-sm text-muted-foreground">Starting Mugiwara...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold text-destructive-text">
            Could not start
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button
            className="mt-5 w-full"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  // Server setup is an overlay, not a route: the URL (including a deep link)
  // never changes, so connecting or cancelling cannot create a duplicate
  // history entry.
  if (needsServerSetup || showServerSetup) {
    return (
      <ServerSetup
        initialUrl={
          apiBaseUrl ||
          getStoredServerUrl() ||
          (typeof window !== "undefined" ? window.location.origin : "")
        }
        canCancel={!needsServerSetup}
        lockUrl={!canChangeServer}
        onCancel={() => setShowServerSetup(false)}
        onConnected={handleServerConnected}
      />
    );
  }

  return (
    <ApiClientProvider
      baseUrl={apiBaseUrl}
      authToken={authToken}
      contentToken={contentToken}
    >
      <ThemeApplier />
      <ToastProvider>
        <AppChromeProvider
          value={{
            serverLabel,
            canChangeServer,
            onChangeServer: handleChangeServer,
          }}
        >
          <RouterProvider router={router} />
        </AppChromeProvider>
      </ToastProvider>
    </ApiClientProvider>
  );
}

export default App;
