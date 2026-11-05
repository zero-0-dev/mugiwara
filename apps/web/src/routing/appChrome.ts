import { createContext, useContext } from "react";

/**
 * Shell-wide values that used to be props on App.tsx. Keeping them in a small
 * context lets routes stay URL-driven without threading App state through the
 * router configuration.
 */
export interface AppChrome {
  serverLabel: string;
  canChangeServer: boolean;
  onChangeServer: () => void;
}

const AppChromeContext = createContext<AppChrome>({
  serverLabel: "",
  canChangeServer: false,
  onChangeServer: () => undefined,
});

export const AppChromeProvider = AppChromeContext.Provider;

export function useAppChrome(): AppChrome {
  return useContext(AppChromeContext);
}
