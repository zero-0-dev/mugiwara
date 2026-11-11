import { spawn, ChildProcess } from "child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { app } from "electron";
import net from "net";

interface ServerConfig {
  port: number;
  dataDir: string;
}

export class ServerManager {
  private serverProcess: ChildProcess | null = null;
  private readonly config: ServerConfig;
  private isReady: boolean = false;
  private readonly isDev: boolean;
  private readonly logFile: string;
  private startupError: Error | null = null;

  constructor() {
    this.isDev = !app.isPackaged;
    this.config = {
      port: 0, // Will find available port
      dataDir: path.join(app.getPath("userData"), "data"),
    };

    mkdirSync(this.config.dataDir, { recursive: true });
    this.logFile = path.join(this.config.dataDir, "server.log");
    // The packaged app has no attached console on macOS/Windows, so the log
    // file is the only way to diagnose a failed embedded server.
    try {
      writeFileSync(this.logFile, "");
    } catch {
      // Best effort: a read-only data directory must not block startup.
    }
  }

  getLogFile(): string {
    return this.logFile;
  }

  private log(scope: string, message: string): void {
    const line = `[${new Date().toISOString()}] [${scope}] ${message}`;
    console.log(line);
    try {
      appendFileSync(this.logFile, `${line}\n`);
    } catch {
      // Logging is diagnostic only; never fail the server because of it.
    }
  }

  async start(): Promise<number> {
    if (this.serverProcess) {
      throw new Error("Server already running");
    }

    // Find available port
    this.config.port = await this.findAvailablePort(3001);

    if (this.isDev) {
      return this.config.port; // In dev mode, server is started separately by turbo, so just return the port
    }

    // Run the embedded server with Electron's own Node runtime instead of a
    // system `node`. GUI apps launched from Finder/Explorer get a minimal
    // PATH, so `spawn("node")` fails with ENOENT even when Node is installed.
    // ELECTRON_RUN_AS_NODE turns the app binary itself into a Node-compatible
    // runtime, which is always present and keeps the version predictable.
    const serverCmd = process.execPath;
    const serverArgs = [path.join(process.resourcesPath, "server/index.js")];
    // Never inherit the launching process' working directory: on macOS a
    // Finder-launched app starts in "/", which would make relative storage
    // paths unwritable.
    const serverCwd = app.getPath("userData");

    // Set environment variables
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: this.config.port.toString(),
      DATA_DIR: this.config.dataDir,
      WEB_DIR: path.join(process.resourcesPath, "web"),
      HOST: "0.0.0.0",
      NODE_ENV: "production",
      // The desktop shell deliberately allows plugin installation even though
      // the embedded server binds the LAN interface. Plugin installs still
      // require an admin token, explicit confirmation, an approved registry and
      // npm lifecycle scripts are disabled.
      MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL: "true",
    };

    this.log("MANAGER", `Starting server on port ${this.config.port}`);
    this.log("MANAGER", `Command: ${serverCmd} ${serverArgs.join(" ")}`);
    this.log("MANAGER", `Working directory: ${serverCwd}`);
    this.log("MANAGER", `Data directory: ${this.config.dataDir}`);

    this.startupError = null;

    // Start server as child process
    this.serverProcess = spawn(serverCmd, serverArgs, {
      env,
      cwd: serverCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // A missing/unexecutable binary emits "error" instead of "exit". Without a
    // listener Node throws an uncaught exception and the whole app dies, so
    // record it and let waitForServer surface a readable failure.
    this.serverProcess.on("error", (error) => {
      this.startupError = error;
      this.log("MANAGER", `Failed to spawn server: ${error.message}`);
    });

    // Handle server output
    this.serverProcess.stdout?.on("data", (data) => {
      this.log("SERVER", data.toString().trimEnd());
    });

    this.serverProcess.stderr?.on("data", (data) => {
      this.log("ERROR", data.toString().trimEnd());
    });

    // Handle server exit
    this.serverProcess.on("exit", (code, signal) => {
      this.log(
        "MANAGER",
        `Server exited with code ${code}, signal ${signal}`,
      );
      if (!this.isReady && !this.startupError) {
        this.startupError = new Error(
          `The embedded server exited before it became ready (code ${code}, signal ${signal}).`,
        );
      }
      this.serverProcess = null;
      this.isReady = false;
    });

    // Wait for server to be ready
    await this.waitForServer(this.config.port, 30000); // 30 second timeout
    this.isReady = true;

    this.log("MANAGER", `Server ready on port ${this.config.port}`);
    return this.config.port;
  }

  async stop(): Promise<void> {
    if (!this.serverProcess) {
      return;
    }

    this.log("MANAGER", "Stopping server...");

    // Send graceful shutdown signal
    this.serverProcess.kill("SIGTERM");

    // Wait for process to exit (with timeout)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.log("MANAGER", "Force killing server...");
        this.serverProcess?.kill("SIGKILL");
        resolve();
      }, 5000);

      this.serverProcess?.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.serverProcess = null;
    this.isReady = false;
  }

  getPort(): number {
    return this.config.port;
  }

  isServerReady(): boolean {
    return this.isReady;
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();

      server.listen(startPort, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          // Port in use, try next
          resolve(this.findAvailablePort(startPort + 1));
        } else {
          reject(err);
        }
      });
    });
  }

  private async waitForServer(port: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    // The server binds HOST=0.0.0.0. Use IPv4 loopback explicitly: on some
    // systems "localhost" resolves to ::1 first, while the listener is IPv4,
    // which makes startup look like a timeout even though the server is up.
    const healthUrl = `http://127.0.0.1:${port}/api/health`;

    while (Date.now() - startTime < timeoutMs) {
      if (this.startupError) {
        throw this.startupError;
      }

      try {
        const response = await fetch(healthUrl, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          return;
        }
      } catch {
        // Server not ready yet, wait and retry
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(
      `Server failed to start within ${timeoutMs}ms. See ${this.logFile} for details.`,
    );
  }
}
