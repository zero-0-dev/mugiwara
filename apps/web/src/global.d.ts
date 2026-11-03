export {};

declare global {
  interface ElectronAPI {
    getServerPort: () => Promise<number>;
    getApiUrl: (path: string) => Promise<string>;
    getAppVersion: () => Promise<string>;
    selectFolder: () => Promise<string | null>;
    openFolder: (folderPath: string) => Promise<string>;
    platform: string;
  }

  interface Window {
    electronAPI?: ElectronAPI;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}
