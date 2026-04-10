import React, { createContext, useContext, useState, useEffect } from "react";
import { apiClient } from "../api/client";

type ConfigContextType = {
  isConfigured: boolean;
  serverUrl: string;
  setServerUrl: (url: string) => Promise<void>;
  testConnection: (url?: string) => Promise<boolean>;
  isLoading: boolean;
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [serverUrl, setServerUrlState] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkConfiguration();
  }, []);

  async function checkConfiguration() {
    try {
      const configured = await apiClient.initialize();
      if (configured) {
        const url = apiClient.getServerUrl();
        setServerUrlState(url);
        setIsConfigured(true);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function setServerUrl(url: string) {
    await apiClient.saveServerUrl(url);
    setServerUrlState(url);
    setIsConfigured(true);
  }

  async function testConnection(url?: string) {
    return apiClient.testConnection(url);
  }

  return (
    <ConfigContext.Provider
      value={{
        isConfigured,
        serverUrl,
        setServerUrl,
        testConnection,
        isLoading,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
}
