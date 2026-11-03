import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { ServerManager } from "./server-manager";

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager | null = null;

// Development mode flag
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const DEV_SERVER_PORT = 3001;

// Optional: point the desktop shell at a Mugiwara server running elsewhere on
// the LAN instead of starting an embedded server.
const EXTERNAL_SERVER_URL =
  process.env.MUGIWARA_SERVER_URL?.replace(/\/+$/, "") || "";

function getAppUrl(serverPort: number): string {
  if (EXTERNAL_SERVER_URL) return EXTERNAL_SERVER_URL;
  return isDev
    ? "http://localhost:5173"
    : `http://127.0.0.1:${serverPort}`;
}

function getApiBase(apiPath: string): string {
  if (EXTERNAL_SERVER_URL) return `${EXTERNAL_SERVER_URL}${apiPath}`;
  const port = isDev
    ? DEV_SERVER_PORT
    : serverManager?.getPort() || DEV_SERVER_PORT;
  return `http://127.0.0.1:${port}${apiPath}`;
}

async function loadAppWindow(url: string) {
  const attempts = isDev ? 20 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await mainWindow?.loadURL(url);
      return;
    } catch (error) {
      if (attempt === attempts || !mainWindow) throw error;
      // In dev, Vite and Electron start at the same time. Retry briefly
      // instead of showing Chromium's connection error page.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function createWindow(serverPort: number) {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  // Store server port in window for renderer to access
  (mainWindow as any).serverPort = serverPort;

  // Load the shared web client. In production the local server serves it,
  // which gives the renderer the same origin as the API and avoids file://
  // security exceptions.
  await loadAppWindow(getAppUrl(serverPort));

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Initialize application
async function initialize() {
  try {
    if (EXTERNAL_SERVER_URL) {
      console.log(`[Main] Using external server: ${EXTERNAL_SERVER_URL}`);
      await createWindow(0);
      return;
    }

    let serverPort: number;

    if (isDev) {
      // In dev mode, assume server is running separately on port 3001
      console.log(
        "[Main] Dev mode: Assuming server is running on port",
        DEV_SERVER_PORT,
      );
      serverPort = DEV_SERVER_PORT;
    } else {
      // In production, start the embedded server
      serverManager = new ServerManager();
      serverPort = await serverManager.start();
      console.log(
        `[Main] Production mode: Started embedded server on port ${serverPort}`,
      );
    }

    // Create the main window
    await createWindow(serverPort);
  } catch (error) {
    console.error("[Main] Failed to initialize:", error);
    app.quit();
  }
}

// IPC handlers
ipcMain.handle("get-server-port", () => {
  if (EXTERNAL_SERVER_URL) {
    try {
      return Number(new URL(EXTERNAL_SERVER_URL).port) || 80;
    } catch {
      return 0;
    }
  }
  if (isDev) {
    return DEV_SERVER_PORT;
  }
  return serverManager?.getPort() || DEV_SERVER_PORT;
});

ipcMain.handle("get-api-url", (event, apiPath: string) => {
  return getApiBase(apiPath);
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("open-folder", async (event, folderPath: string) => {
  const resolvedPath = path.isAbsolute(folderPath)
    ? folderPath
    : path.resolve(path.join(process.cwd(), "../server"), folderPath);
  console.log(`[Main] Opening folder: ${resolvedPath}`);
  return shell.openPath(resolvedPath);
});

ipcMain.handle("select-folder", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Manga Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// App event handlers
app.whenReady().then(initialize);

app.on("window-all-closed", async () => {
  // Stop the server before quitting (only in production)
  if (!isDev && serverManager) {
    await serverManager.stop();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  // Stop server before exit (only in production)
  if (!isDev && serverManager) {
    event.preventDefault();
    await serverManager.stop();
    app.exit(0);
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    const port = EXTERNAL_SERVER_URL
      ? 0
      : isDev
        ? DEV_SERVER_PORT
        : serverManager?.getPort() || DEV_SERVER_PORT;
    createWindow(port);
  }
});
