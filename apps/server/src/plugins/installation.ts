import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { InstalledPluginRecord, PluginPackageInfo } from "./types";
import { PluginInstallError } from "./errors";
import {
  extractTarball,
  readPackageJsonFromTarball,
  type TarballPackageJson,
} from "./tarball";
import { eq } from "drizzle-orm";
import * as schema from "../database/schema";

export { PluginInstallError };

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

export interface TarballInstallResult {
  record: InstalledPluginRecord;
  replaced: boolean;
  wasEnabled: boolean;
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

  /**
   * Installs a plugin from a local .tar/.tar.gz uploaded by an admin. The
   * archive is validated, extracted into DATA_DIR/plugins/node_modules, and
   * recorded exactly like an npm-installed plugin. Re-uploading the same
   * package name replaces the previous version and removes the old tarball.
   */
  async installFromTarball(tarball: Buffer): Promise<TarballInstallResult> {
    this.assertInstallAllowed();

    const { packageJson, directory } = readPackageJsonFromTarball(tarball);
    const name = this.validatePackageName(packageJson.name);
    const version = this.validateTarballVersion(packageJson.version);
    const type = this.validateTarballType(packageJson, name);

    if (this.BUILT_IN_PLUGINS.includes(name)) {
      throw new PluginInstallError(
        `${name} is a built-in plugin and cannot be installed separately`,
      );
    }

    await fs.mkdir(this.pluginsDir, { recursive: true });
    const staging = await fs.mkdtemp(
      path.join(this.pluginsDir, ".tmp-plugin-"),
    );

    let storedTarballPath: string | null = null;
    let destinationCreated = false;

    try {
      await extractTarball(tarball, staging);
      const sourceDir = directory
        ? path.join(staging, ...directory.split("/"))
        : staging;

      await fs.access(path.join(sourceDir, "package.json"));

      const dependencies = packageJson.dependencies ?? {};
      if (typeof dependencies !== "object" || Array.isArray(dependencies)) {
        throw new PluginInstallError(
          `Package ${name} has an invalid "dependencies" field in package.json.`,
        );
      }
      const dependencyCount = Object.keys(dependencies).length;
      const hasVendoredModules = await pathExists(
        path.join(sourceDir, "node_modules"),
      );
      if (dependencyCount > 0 && !hasVendoredModules) {
        console.log(
          `📦 Installing dependencies for ${name}@${version} (scripts disabled)`,
        );
        await this.runNpm(this.buildNpmInstallPackageArgs(), {
          cwd: sourceDir,
        });
      }

      storedTarballPath = await this.storeTarball(name, version, tarball);

      const destination = path.join(
        this.pluginsDir,
        "node_modules",
        ...name.split("/"),
      );
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.rm(destination, { recursive: true, force: true });
      await fs.rename(sourceDir, destination);
      destinationCreated = true;

      await this.setPackageJsonDependency(
        name,
        `file:${this.tarballStoredPath(name, version)}`,
      );

      const existing = await this.db.query.installedPlugins.findFirst({
        where: eq(schema.installedPlugins.id, name),
      });
      const now = new Date().toISOString();

      if (existing) {
        await this.db
          .update(schema.installedPlugins)
          .set({ type, version, updatedAt: now })
          .where(eq(schema.installedPlugins.id, name));

        await this.removeStoredTarballs(name, path.basename(storedTarballPath));

        console.log(
          `✅ Replaced plugin: ${name} v${existing.version} → v${version} (tarball)`,
        );

        return {
          record: {
            ...existing,
            type,
            version,
            updatedAt: now,
          },
          replaced: true,
          wasEnabled: existing.isEnabled,
        };
      }

      const record: InstalledPluginRecord = {
        id: name,
        type,
        version,
        isBuiltin: false,
        isEnabled: true,
        config: {},
        installedAt: now,
        updatedAt: now,
      };

      await this.db.insert(schema.installedPlugins).values(record);
      await this.removeStoredTarballs(name, path.basename(storedTarballPath));
      console.log(`✅ Installed plugin from tarball: ${name} v${version}`);

      return { record, replaced: false, wasEnabled: true };
    } catch (error) {
      try {
        if (destinationCreated) {
          await this.removePackage(name);
        } else if (storedTarballPath) {
          await fs.rm(storedTarballPath, { force: true });
        }
      } catch (cleanupError) {
        console.error(
          `Failed to clean up tarball install for ${name}:`,
          cleanupError instanceof Error ? cleanupError.message : cleanupError,
        );
      }
      throw error;
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  buildNpmInstallPackageArgs(): string[] {
    return [
      "install",
      "--omit=dev",
      "--no-package-lock",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--registry=${this.options.registryUrl}`,
    ];
  }

  private validateTarballVersion(version: unknown): string {
    if (typeof version !== "string" || !VERSION_PATTERN.test(version.trim())) {
      throw new PluginInstallError(
        "Plugin tarball package.json must declare a valid version.",
      );
    }
    return version.trim();
  }

  private validateTarballType(
    packageJson: TarballPackageJson,
    name: string,
  ): InstalledPluginRecord["type"] {
    const type = packageJson.mugiwara?.type;
    if (type !== "source" && type !== "storage") {
      throw new PluginInstallError(
        `Package ${name} is not a valid Mugiwara plugin (expected "mugiwara.type" to be "source" or "storage").`,
      );
    }
    return type;
  }

  private tarballFileName(name: string, version: string): string {
    return `${this.tarballDirectoryName(name)}-${version}.tgz`;
  }

  private tarballDirectoryName(name: string): string {
    return name.replace(/^@/, "").replace(/\//g, "-");
  }

  private tarballStoredPath(name: string, version: string): string {
    return path.posix.join(
      "tarballs",
      this.tarballDirectoryName(name),
      this.tarballFileName(name, version),
    );
  }

  private async storeTarball(
    name: string,
    version: string,
    tarball: Buffer,
  ): Promise<string> {
    const tarballsDir = path.join(
      this.pluginsDir,
      "tarballs",
      this.tarballDirectoryName(name),
    );
    await fs.mkdir(tarballsDir, { recursive: true });
    const filePath = path.join(
      tarballsDir,
      this.tarballFileName(name, version),
    );
    await fs.writeFile(filePath, tarball, { mode: 0o600 });
    return filePath;
  }

  private async removeStoredTarballs(
    name: string,
    keep?: string,
  ): Promise<void> {
    const tarballsDir = path.join(
      this.pluginsDir,
      "tarballs",
      this.tarballDirectoryName(name),
    );
    let files: string[];
    try {
      files = await fs.readdir(tarballsDir);
    } catch {
      return;
    }
    await Promise.all(
      files
        .filter((file) => file.endsWith(".tgz") && file !== keep)
        .map((file) =>
          fs.rm(path.join(tarballsDir, file), { force: true }).catch(() => {}),
        ),
    );
  }

  private async setPackageJsonDependency(
    packageName: string,
    spec: string,
  ): Promise<void> {
    const packageJsonPath = path.join(this.pluginsDir, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    pkg.dependencies = pkg.dependencies ?? {};
    pkg.dependencies[packageName] = spec;
    await fs.writeFile(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
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
    await this.removeStoredTarballs(packageName);

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

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
