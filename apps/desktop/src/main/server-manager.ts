import { spawn, ChildProcess } from "child_process";
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

  constructor() {
    this.isDev = !app.isPackaged;
    this.config = {
      port: 0, // Will find available port
      dataDir: path.join(app.getPath("userData"), "data"),
    };
  }

  async start(): Promise<number> {
    if (this.serverProcess) {
      throw new Error("Server already running");
    }

    // Find available port
    this.config.port = await this.findAvailablePort(3001);

    // Determine server path and command based on environment
    let serverCmd: string;
    let serverArgs: string[];
    let serverCwd: string;

    if (this.isDev) {
      return this.config.port; // In dev mode, server is started separately by turbo, so just return the port
    } else {
      // In production, run the compiled server
      serverCmd = "node";
      serverArgs = [path.join(process.resourcesPath, "server/index.js")];
      serverCwd = process.cwd();
    }

    // Set environment variables
    const env = {
      ...process.env,
      PORT: this.config.port.toString(),
      DATA_DIR: this.config.dataDir,
      WEB_DIR: path.join(process.resourcesPath, "web"),
      HOST: "0.0.0.0",
      NODE_ENV: this.isDev ? "development" : "production",
    };

    console.log(`[ServerManager] Starting server on port ${this.config.port}`);
    console.log(
      `[ServerManager] Command: ${serverCmd} ${serverArgs.join(" ")}`,
    );
    console.log(`[ServerManager] Working directory: ${serverCwd}`);
    console.log(`[ServerManager] Data directory: ${this.config.dataDir}`);

    // Start server as child process
    this.serverProcess = spawn(serverCmd, serverArgs, {
      env,
      cwd: serverCwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Handle server output
    this.serverProcess.stdout?.on("data", (data) => {
      console.log(`[Server] ${data.toString().trim()}`);
    });

    this.serverProcess.stderr?.on("data", (data) => {
      console.error(`[Server Error] ${data.toString().trim()}`);
    });

    // Handle server exit
    this.serverProcess.on("exit", (code, signal) => {
      console.log(
        `[ServerManager] Server exited with code ${code}, signal ${signal}`,
      );
      this.serverProcess = null;
      this.isReady = false;
    });

    // Wait for server to be ready
    await this.waitForServer(this.config.port, 30000); // 30 second timeout
    this.isReady = true;

    console.log(`[ServerManager] Server ready on port ${this.config.port}`);
    return this.config.port;
  }

  async stop(): Promise<void> {
    if (!this.serverProcess) {
      return;
    }

    console.log("[ServerManager] Stopping server...");

    // Send graceful shutdown signal
    this.serverProcess.kill("SIGTERM");

    // Wait for process to exit (with timeout)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log("[ServerManager] Force killing server...");
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

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    throw new Error(`Server failed to start within ${timeoutMs}ms`);
  }
}
