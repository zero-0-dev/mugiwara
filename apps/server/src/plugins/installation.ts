import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { InstalledPluginRecord, PluginPackageInfo } from "./types";
import { eq } from "drizzle-orm";
import * as schema from "../database/schema";

export interface PluginInstallPolicy {
  installEnabled: boolean;
  reason: string | null;
  exposedOnNetwork: boolean;
  allowRemoteInstall: boolean;
  registryUrl: string;
  allowlistMode: "explicit" | "namespace";
  allowedPackages: string[];
}

export interface PluginInstallationOptions {
  host?: string;
  registryUrl?: string;
  allowlist?: string[];
  allowRemoteInstall?: boolean;
  installEnabled?: boolean;
  env?: NodeJS.ProcessEnv;
  npmRunner?: NpmRunner;
}

export type NpmRunner = (
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<void>;

export class PluginInstallError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string,
    statusCode = 400,
    code = "plugin_install_error",
  ) {
    super(message);
    this.name = "PluginInstallError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
const PACKAGE_NAME_PATTERN =
  /^(?:mugiwara-plugin-[a-z0-9][a-z0-9._-]*|@mugiwara-manga\/[a-z0-9][a-z0-9._-]*)$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export class PluginInstallationService {
  private pluginsDir: string;
  private db: any;
  private readonly options: {
    host: string;
    registryUrl: string;
    allowRemoteInstall: boolean;
    allowlist: string[];
    installEnabled: boolean;
    exposedOnNetwork: boolean;
    npmRunner: NpmRunner;
  };

  constructor(
    db: any,
    dataDir: string,
    options: PluginInstallationOptions = {},
  ) {
    this.db = db;
    this.pluginsDir = path.join(dataDir, "plugins");

    const env = options.env ?? process.env;
    const host = options.host ?? env.HOST ?? "0.0.0.0";
    const exposedOnNetwork = !isLoopbackHost(host);
    const allowRemoteInstall =
      options.allowRemoteInstall ??
      env.MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL === "true";
    const registryUrl = normalizeRegistry(
      options.registryUrl ?? env.MUGIWARA_PLUGIN_REGISTRY ?? DEFAULT_REGISTRY,
    );
    const allowlist = (
      options.allowlist ??
      (env.MUGIWARA_PLUGIN_ALLOWLIST || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    ).map((item) => item.trim());

    this.options = {
      host,
      registryUrl,
      allowRemoteInstall,
      allowlist,
      installEnabled:
        options.installEnabled ??
        env.MUGIWARA_PLUGIN_INSTALL_ENABLED !== "false",
      exposedOnNetwork,
      npmRunner: options.npmRunner ?? defaultNpmRunner,
    };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.pluginsDir, { recursive: true });

    const packageJsonPath = path.join(this.pluginsDir, "package.json");
    try {
      await fs.access(packageJsonPath);
    } catch {
      const packageJson = {
        name: "mugiwara-plugins",
        version: "1.0.0",
        private: true,
        dependencies: {},
      };
      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
  }

  getPolicy(): PluginInstallPolicy {
    const exposedOnNetwork = this.options.exposedOnNetwork;
    const allowRemoteInstall = this.options.allowRemoteInstall;
    const baseEnabled = this.options.installEnabled;
    const installEnabled =
      baseEnabled && (!exposedOnNetwork || allowRemoteInstall);
    let reason: string | null = null;
    if (!baseEnabled) {
      reason = "Plugin installation is disabled by configuration.";
    } else if (!installEnabled) {
      reason =
        "Plugin installation is disabled while the server is exposed on a non-loopback interface. Set MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL=true to allow it.";
    }

    return {
      installEnabled,
      reason,
      exposedOnNetwork,
      allowRemoteInstall,
      registryUrl: this.options.registryUrl,
      allowlistMode:
        this.options.allowlist.length > 0 ? "explicit" : "namespace",
      allowedPackages: [...this.options.allowlist],
    };
  }

  assertInstallAllowed(): void {
    const policy = this.getPolicy();
    if (!policy.installEnabled) {
      throw new PluginInstallError(
        policy.reason ?? "Plugin installation is disabled.",
        403,
        "plugin_install_disabled",
      );
    }
  }

  validatePackageName(packageName: unknown): string {
    if (typeof packageName !== "string" || !packageName.trim()) {
      throw new PluginInstallError("packageName is required");
    }
    const name = packageName.trim();
    if (name.length > 214 || !PACKAGE_NAME_PATTERN.test(name)) {
      throw new PluginInstallError(
        'Invalid plugin name. Expected "mugiwara-plugin-*" or "@mugiwara-manga/*".',
      );
    }
    if (name.includes("..") || name.includes("\\") || name.includes("//")) {
      throw new PluginInstallError("Invalid plugin name");
    }
    if (!this.isAllowedPackage(name)) {
      throw new PluginInstallError(
        `Package ${name} is not on the approved plugin allowlist.`,
        403,
        "plugin_not_allowlisted",
      );
    }
    return name;
  }

  private isAllowedPackage(name: string): boolean {
    if (this.options.allowlist.length > 0) {
      return this.options.allowlist.includes(name);
    }
    return (
      name.startsWith("mugiwara-plugin-") || name.startsWith("@mugiwara-manga/")
    );
  }

  validateVersion(version: unknown): string {
    if (version === undefined || version === null || version === "") {
      return "latest";
    }
    if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
      throw new PluginInstallError("Invalid plugin version");
    }
    return version;
  }

  buildNpmInstallArgs(packageName: string, version: string): string[] {
    return [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--registry=${this.options.registryUrl}`,
      `${packageName}@${version}`,
    ];
  }

  buildNpmUpdateArgs(packageName: string): string[] {
    return [
      "update",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--registry=${this.options.registryUrl}`,
      packageName,
    ];
  }

  // Built-in plugin IDs that cannot be installed/overridden
  private readonly BUILT_IN_PLUGINS = [
    "@mugiwara-manga/source-local",
    "@mugiwara-manga/storage-local",
  ];

  async install(
    packageName: string,
    version?: string,
  ): Promise<InstalledPluginRecord> {
    this.assertInstallAllowed();

    const name = this.validatePackageName(packageName);
    const targetVersion = this.validateVersion(version);

    if (this.BUILT_IN_PLUGINS.includes(name)) {
      throw new PluginInstallError(
        `${name} is a built-in plugin and cannot be installed separately`,
      );
    }

    const packageSpec = `${name}@${targetVersion}`;
    console.log(`📦 Installing plugin: ${packageSpec} (scripts disabled)`);

    await this.runNpm(this.buildNpmInstallArgs(name, targetVersion), {
      cwd: this.pluginsDir,
    });

    const packageInfo = await this.getPackageInfo(name);

    if (!packageInfo.mugiwara) {
      await this.removePackage(name);
      throw new PluginInstallError(
        `Package ${name} is not a valid Mugiwara plugin (missing "mugiwara" field in package.json)`,
      );
    }

    const record: InstalledPluginRecord = {
      id: name,
      type: packageInfo.mugiwara.type,
      version: packageInfo.version,
      isBuiltin: false,
      isEnabled: true,
      config: {},
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await this.db.insert(schema.installedPlugins).values(record);
    } catch (error) {
      await this.removePackage(name);
      throw error;
    }

    console.log(`✅ Installed plugin: ${name} v${packageInfo.version}`);

    return record;
  }

  async uninstall(packageName: string): Promise<void> {
    if (this.BUILT_IN_PLUGINS.includes(packageName)) {
      throw new PluginInstallError(
        `Cannot uninstall built-in plugin: ${packageName}`,
      );
    }

    const existing = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (!existing) {
      throw new PluginInstallError(`Plugin not found: ${packageName}`, 404);
    }

    console.log(`🗑️ Uninstalling plugin: ${packageName}`);

    await this.db
      .delete(schema.installedPlugins)
      .where(eq(schema.installedPlugins.id, packageName));

    try {
      await this.removePackage(packageName);
    } catch (error) {
      await this.db.insert(schema.installedPlugins).values(existing);
      throw error;
    }

    console.log(`✅ Uninstalled plugin: ${packageName}`);
  }

  async update(packageName: string): Promise<InstalledPluginRecord> {
    this.assertInstallAllowed();

    if (this.BUILT_IN_PLUGINS.includes(packageName)) {
      throw new PluginInstallError(
        `Cannot update built-in plugin: ${packageName}`,
      );
    }

    const existing = await this.db.query.installedPlugins.findFirst({
      where: eq(schema.installedPlugins.id, packageName),
    });

    if (!existing) {
      throw new PluginInstallError(`Plugin not found: ${packageName}`, 404);
    }

    console.log(`🔄 Updating plugin: ${packageName} (scripts disabled)`);

    await this.runNpm(this.buildNpmUpdateArgs(packageName), {
      cwd: this.pluginsDir,
    });

    const packageInfo = await this.getPackageInfo(packageName);

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

  private async removePackage(packageName: string): Promise<void> {
    const packagePath = path.join(
      this.pluginsDir,
      "node_modules",
      ...packageName.split("/"),
    );

    await fs.rm(packagePath, { recursive: true, force: true });

    const packageJsonPath = path.join(this.pluginsDir, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    delete pkg.dependencies?.[packageName];
    await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  private async runNpm(
    args: string[],
    options: { cwd: string },
  ): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_ignore_scripts: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_registry: this.options.registryUrl,
    };
    await this.options.npmRunner(args, { cwd: options.cwd, env });
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost"
  );
}

function normalizeRegistry(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PluginInstallError("Invalid plugin registry URL", 500);
  }
  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new PluginInstallError(
      "Plugin registry must use HTTPS (HTTP is only allowed for localhost)",
      500,
    );
  }
  return url.toString().replace(/\/+$/, "/");
}

function defaultNpmRunner(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npm", args, {
      cwd: options.cwd,
      env: options.env,
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
          new PluginInstallError(
            `npm ${args[0] ?? "command"} failed: ${truncate(stderr || stdout)}`,
            502,
            "npm_failed",
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(
        new PluginInstallError(
          `Failed to spawn npm: ${err.message}`,
          502,
          "npm_spawn_failed",
        ),
      );
    });
  });
}

function truncate(value: string, max = 500): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
