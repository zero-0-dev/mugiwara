import React, { createContext, useContext, ReactNode } from "react";
import { ApiClient } from "./client";

const ApiClientContext = createContext<ApiClient | null>(null);

/** Retry a failed content-token renewal after this delay. */
const CONTENT_TOKEN_RETRY_MS = 30 * 1000;

export function ApiClientProvider({
  baseUrl,
  authToken,
  contentToken,
  children,
}: {
  baseUrl: string;
  authToken: string | null;
  contentToken?: string | null;
  children: ReactNode;
}) {
  const clientRef = React.useRef<ApiClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new ApiClient(baseUrl, authToken);
  }
  React.useEffect(() => {
    clientRef.current?.setBaseUrl(baseUrl);
    clientRef.current?.setAuthToken(authToken);
  }, [baseUrl, authToken]);
  React.useEffect(() => {
    if (contentToken) {
      clientRef.current?.setContentToken(contentToken);
    } else if (authToken) {
      void clientRef.current?.refreshContentToken();
    }
  }, [authToken, contentToken]);
  React.useEffect(() => {
    if (!authToken) return undefined;
    const client = clientRef.current;
    if (!client) return undefined;

    let timer: number | null = null;
    let cancelled = false;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const renew = async () => {
      if (cancelled) return;
      const token = await client.refreshContentToken(true);
      if (cancelled) return;
      if (!token) {
        clearTimer();
        timer = window.setTimeout(() => void renew(), CONTENT_TOKEN_RETRY_MS);
        return;
      }
      schedule();
    };

    const schedule = () => {
      if (cancelled) return;
      clearTimer();
      const delay = client.contentTokenRefreshDelayMs();
      if (delay === null) return;
      timer = window.setTimeout(() => void renew(), Math.max(0, delay));
    };

    // Timers are throttled while the window is hidden (and paused across
    // suspend), so renew immediately when the app becomes visible again.
    const handleVisibility = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const delay = client.contentTokenRefreshDelayMs();
      if (delay === null) return;
      if (delay <= 0) void renew();
      else schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authToken]);
  return (
    <ApiClientContext.Provider value={clientRef.current}>
      {children}
    </ApiClientContext.Provider>
  );
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error("useApiClient must be used within an ApiClientProvider");
  }
  return client;
}
