import React, { createContext, useContext, ReactNode } from "react";
import { ApiClient } from "./client";

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const clientRef = React.useRef<ApiClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new ApiClient(baseUrl);
  }
  React.useEffect(() => {
    clientRef.current?.setBaseUrl(baseUrl);
  }, [baseUrl]);
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
