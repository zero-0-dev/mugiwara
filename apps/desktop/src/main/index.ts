import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import { ServerManager } from "./server-manager";

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager | null = null;

// Development mode flag
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const DEV_SERVER_PORT = 3001;

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
      webSecurity: false, // Allow loading local images
    },
  });

  // Store server port in window for renderer to access
  (mainWindow as any).serverPort = serverPort;

  // Load the app
  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Initialize application
async function initialize() {
  try {
    let serverPort: number;

    if (isDev) {
      // In dev mode, assume server is running separately on port 3001
      console.log(
        "[Main] Dev mode: Assuming server is running on port",
        DEV_SERVER_PORT,
      );
      console.log(
        "[Main] Start server separately with: cd apps/server && pnpm dev",
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
  if (isDev) {
    return DEV_SERVER_PORT;
  }
  return serverManager?.getPort() || DEV_SERVER_PORT;
});

ipcMain.handle("get-api-url", (event, apiPath: string) => {
  const port = isDev
    ? DEV_SERVER_PORT
    : serverManager?.getPort() || DEV_SERVER_PORT;
  return `http://localhost:${port}${apiPath}`;
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
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
    const port = isDev
      ? DEV_SERVER_PORT
      : serverManager?.getPort() || DEV_SERVER_PORT;
    createWindow(port);
  }
});
