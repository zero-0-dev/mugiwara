import { contextBridge, ipcRenderer } from "electron";

// Expose API to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Server info
  getServerPort: () => ipcRenderer.invoke("get-server-port"),
  getApiUrl: (path: string) => ipcRenderer.invoke("get-api-url", path),

  // App info
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  // File dialogs
  selectFolder: () => ipcRenderer.invoke("select-folder"),

  // Folder operations
  openFolder: (folderPath: string) => ipcRenderer.invoke("open-folder", folderPath),

  // Platform
  platform: process.platform,
});

// TypeScript declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getServerPort: () => Promise<number>;
      getApiUrl: (path: string) => Promise<string>;
      getAppVersion: () => Promise<string>;
      selectFolder: () => Promise<string | null>;
      openFolder: (folderPath: string) => Promise<string>;
      platform: string;
    };
  }
}
