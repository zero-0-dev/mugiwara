import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { InstalledPluginRecord, PluginPackageInfo } from "./types";
import { eq } from "drizzle-orm";
import * as schema from "../database/schema";

export class PluginInstallationService {
  private pluginsDir: string;
  private db: any;

  constructor(db: any, dataDir: string) {
    this.db = db;
    this.pluginsDir = path.join(dataDir, "plugins");
  }

  async initialize(): Promise<void> {
    // Ensure plugins directory exists
    await fs.mkdir(this.pluginsDir, { recursive: true });

    // Ensure package.json exists
    const packageJsonPath = path.join(this.pluginsDir, "package.json");
    try {
      await fs.access(packageJsonPath);
    } catch {
      // Create initial package.json
      const packageJson = {
        name: "mugiwara-plugins",
        version: "1.0.0",
        private: true,
        dependencies: {},
      };
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
  }

  // Built-in plugin IDs that cannot be installed/overridden
  private readonly BUILT_IN_PLUGINS = [
    "@mugiwara/source-local",
    "@mugiwara/storage-local",
  ];

  async install(
    packageName: string,
    version?: string,
  ): Promise<InstalledPluginRecord> {
    // Check if trying to install a built-in plugin
    if (this.BUILT_IN_PLUGINS.includes(packageName)) {
      throw new Error(
        `${packageName} is a built-in plugin and cannot be installed separately`,
      );
    }

    // Validate package name
    if (!this.isValidPluginName(packageName)) {
      throw new Error(
        `Invalid plugin name: ${packageName}. Must start with "mugiwara-plugin-" or "@mugiwara/"`,
      );
    }

    const targetVersion = version || "latest";
    const packageSpec = `${packageName}@${targetVersion}`;

    console.log(`📦 Installing plugin: ${packageSpec}`);

    // Run npm install
    await this.runNpm(["install", packageSpec], { cwd: this.pluginsDir });

    // Get package info
    const packageInfo = await this.getPackageInfo(packageName);

    if (!packageInfo.mugiwara) {
      // Uninstall if not a valid plugin
      await this.runNpm(["uninstall", packageName], { cwd: this.pluginsDir });
      throw new Error(
        `Package ${packageName} is not a valid Mugiwara plugin (missing "mugiwara" field in package.json)`,
      );
    }

    // Insert into database
    const record: InstalledPluginRecord = {
      id: packageName,
      type: packageInfo.mugiwara.type,
      version: packageInfo.version,
      isBuiltin: false,
      isEnabled: true,
      config: {},
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.db.insert(schema.installedPlugins).values(record);

    console.log(`✅ Installed plugin: ${packageName} v${packageInfo.version}`);

    return record;
  }

  async uninstall(packageName: string): Promise<void> {
    // Check if trying to uninstall a built-in plugin
    if (this.BUILT_IN_PLUGINS.includes(packageName)) {
      throw new Error(`Cannot uninstall built-in plugin: ${packageName}`);
    }

    // Check if plugin exists
    const existing = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (!existing) {
      throw new Error(`Plugin not found: ${packageName}`);
    }

    console.log(`🗑️ Uninstalling plugin: ${packageName}`);

    // Run npm uninstall
    await this.runNpm(["uninstall", packageName], { cwd: this.pluginsDir });

    // Remove from database
    await this.db
      .delete(schema.installedPlugins)
      .where(eq(schema.installedPlugins.id, packageName));

    console.log(`✅ Uninstalled plugin: ${packageName}`);
  }

  async update(packageName: string): Promise<InstalledPluginRecord> {
    // Check if trying to update a built-in plugin
    if (this.BUILT_IN_PLUGINS.includes(packageName)) {
      throw new Error(`Cannot update built-in plugin: ${packageName}`);
    }

    const existing = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (!existing) {
      throw new Error(`Plugin not found: ${packageName}`);
    }

    console.log(`🔄 Updating plugin: ${packageName}`);

    // Run npm update
    await this.runNpm(["update", packageName], { cwd: this.pluginsDir });

    // Get updated package info
    const packageInfo = await this.getPackageInfo(packageName);

    // Update database
    const updated: InstalledPluginRecord = {
      ...existing,
      version: packageInfo.version,
      updatedAt: new Date().toISOString(),
    };

    await this.db
      .update(schema.installedPlugins)
      .set({ version: updated.version, updatedAt: updated.updatedAt })
      .where(eq(schema.installedPlugins.id, packageName));

    console.log(`✅ Updated plugin: ${packageName} to v${packageInfo.version}`);

    return updated;
  }

  async getInstalledPlugins(): Promise<InstalledPluginRecord[]> {
    return await this.db.query.installedPlugins.findMany();
  }

  private async getPackageInfo(
    packageName: string,
  ): Promise<PluginPackageInfo> {
    const packageJsonPath = path.join(
      this.pluginsDir,
      "node_modules",
      packageName,
      "package.json",
    );

    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      author: pkg.author,
      keywords: pkg.keywords,
      mugiwara: pkg.mugiwara,
    };
  }

  private isValidPluginName(name: string): boolean {
    return name.startsWith("mugiwara-plugin-") || name.startsWith("@mugiwara/");
  }

  private runNpm(args: string[], options: { cwd: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn("npm", args, {
        cwd: options.cwd,
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(`npm ${args.join(" ")} failed: ${stderr || stdout}`),
          );
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn npm: ${err.message}`));
      });
    });
  }
}
