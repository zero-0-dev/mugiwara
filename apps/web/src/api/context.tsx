import React, { createContext, useContext, ReactNode } from "react";
import { ApiClient } from "./client";

const ApiClientContext = createContext<ApiClient | null>(null);

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
    // Content tokens are short-lived. Refresh well before expiry so covers and
    // reader pages keep loading in Capacitor (which cannot use the cookie).
    const timer = window.setInterval(
      () => {
        void clientRef.current?.refreshContentToken();
      },
      10 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
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
