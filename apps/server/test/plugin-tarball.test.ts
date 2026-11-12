import { existsSync, mkdtempSync } from "node:fs";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  closeDatabase,
  db,
  initDatabase,
  installedPlugins,
} from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";
import { PluginInstallationService } from "../src/plugins/installation";
import { PluginManager } from "../src/plugins/manager";
import { registerBuiltInPlugins } from "../src/plugins";

interface TestTarEntry {
  path: string;
  content?: string;
  type?: "file" | "symlink";
  linkname?: string;
}

function tarHeader(
  name: string,
  size: number,
  typeflag: string,
  linkname?: string,
): Buffer {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.write("00000000000\0", 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii");
  header.write(typeflag, 156, 1, "ascii");
  if (linkname) header.write(linkname, 157, 100, "utf8");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

function createTar(entries: TestTarEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content ?? "", "utf8");
    const typeflag = entry.type === "symlink" ? "2" : "0";
    chunks.push(
      tarHeader(entry.path, content.length, typeflag, entry.linkname),
    );
    if (content.length > 0) {
      chunks.push(content);
      chunks.push(Buffer.alloc((512 - (content.length % 512)) % 512));
    }
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

interface TarballOptions {
  name?: string;
  version?: string;
  type?: string | null;
  packageJson?: Record<string, unknown>;
  entries?: TestTarEntry[];
  prefix?: string;
  gzip?: boolean;
}

function createPluginTarball(options: TarballOptions = {}): Buffer {
  const name = options.name ?? "mugiwara-plugin-demo";
  const version = options.version ?? "1.0.0";
  const type = options.type === undefined ? "source" : options.type;
  const prefix = options.prefix ?? "package";
  const directory = prefix ? `${prefix}/` : "";

  const packageJson = {
    name,
    version,
    main: "dist/index.js",
    ...(type === null ? {} : { mugiwara: { type } }),
    ...options.packageJson,
  };

  const tar = createTar([
    {
      path: `${directory}package.json`,
      content: JSON.stringify(packageJson, null, 2),
    },
    ...(options.entries ?? []),
  ]);
  return options.gzip === false ? tar : gzipSync(tar);
}

function pluginModule(metadataVersion: string, id = "demo"): TestTarEntry {
  return {
    path: "package/dist/index.js",
    content: `"use strict";
module.exports = function createPlugin(config) {
  return {
    metadata: {
      id: ${JSON.stringify(id)},
      name: "Demo Source",
      version: ${JSON.stringify(metadataVersion)},
      type: "source",
      compatibleCore: "^1.0.0"
    },
    config: config,
    async initialize() {},
    async shutdown() {}
  };
};
`,
  };
}

async function pathExists(target: string): Promise<boolean> {
  return existsSync(target);
}

describe("PluginInstallationService tarball installs", () => {
  beforeAll(() => {
    initDatabase();
  });

  beforeEach(async () => {
    await db.delete(installedPlugins);
  });

  it("installs a package into node_modules and records it in the database", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-install-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    const result = await service.installFromTarball(
      createPluginTarball({
        entries: [pluginModule("1.0.0")],
      }),
    );

    expect(result).toMatchObject({
      replaced: false,
      wasEnabled: true,
      record: {
        id: "mugiwara-plugin-demo",
        type: "source",
        version: "1.0.0",
        isBuiltin: false,
        isEnabled: true,
        config: {},
      },
    });

    const installedPackage = JSON.parse(
      await readFile(
        join(
          dataDir,
          "plugins",
          "node_modules",
          "mugiwara-plugin-demo",
          "package.json",
        ),
        "utf8",
      ),
    );
    expect(installedPackage.version).toBe("1.0.0");

    const project = JSON.parse(
      await readFile(join(dataDir, "plugins", "package.json"), "utf8"),
    );
    expect(project.dependencies["mugiwara-plugin-demo"]).toBe(
      "file:tarballs/mugiwara-plugin-demo/mugiwara-plugin-demo-1.0.0.tgz",
    );
    expect(
      await readdir(
        join(dataDir, "plugins", "tarballs", "mugiwara-plugin-demo"),
      ),
    ).toEqual(["mugiwara-plugin-demo-1.0.0.tgz"]);

    const rows = await db.query.installedPlugins.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "mugiwara-plugin-demo",
      version: "1.0.0",
      type: "source",
    });
  });

  it("replaces the previous version and keeps only the latest tarball", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-replace-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    const first = await service.installFromTarball(
      createPluginTarball({ version: "1.0.0" }),
    );

    const { eq } = await import("drizzle-orm");
    await db
      .update(installedPlugins)
      .set({ config: { apiKey: "keep-me" } })
      .where(eq(installedPlugins.id, "mugiwara-plugin-demo"));

    const second = await service.installFromTarball(
      createPluginTarball({
        version: "2.0.0",
        entries: [pluginModule("2.0.0")],
      }),
    );

    expect(second.replaced).toBe(true);
    expect(second.wasEnabled).toBe(true);
    expect(second.record.version).toBe("2.0.0");
    expect(second.record.config).toEqual({ apiKey: "keep-me" });
    expect(second.record.installedAt).toBe(first.record.installedAt);

    const rows = await db.query.installedPlugins.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: "2.0.0" });

    expect(
      await readdir(
        join(dataDir, "plugins", "tarballs", "mugiwara-plugin-demo"),
      ),
    ).toEqual(["mugiwara-plugin-demo-2.0.0.tgz"]);

    const project = JSON.parse(
      await readFile(join(dataDir, "plugins", "package.json"), "utf8"),
    );
    expect(project.dependencies["mugiwara-plugin-demo"]).toBe(
      "file:tarballs/mugiwara-plugin-demo/mugiwara-plugin-demo-2.0.0.tgz",
    );

    const installedPackage = JSON.parse(
      await readFile(
        join(
          dataDir,
          "plugins",
          "node_modules",
          "mugiwara-plugin-demo",
          "package.json",
        ),
        "utf8",
      ),
    );
    expect(installedPackage.version).toBe("2.0.0");
  });

  it("supports archives with package.json at the root", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-root-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    const result = await service.installFromTarball(
      createPluginTarball({ prefix: "", gzip: false }),
    );

    expect(result.record.id).toBe("mugiwara-plugin-demo");
    expect(
      await pathExists(
        join(
          dataDir,
          "plugins",
          "node_modules",
          "mugiwara-plugin-demo",
          "package.json",
        ),
      ),
    ).toBe(true);
  });

  it("rejects path traversal entries before writing anything", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-traversal-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    await expect(
      service.installFromTarball(
        createPluginTarball({
          entries: [{ path: "package/../../../escape.txt", content: "nope" }],
        }),
      ),
    ).rejects.toThrow(/unsafe path|escapes/i);

    expect(existsSync(join(dataDir, "escape.txt"))).toBe(false);
    expect(
      existsSync(
        join(dataDir, "plugins", "node_modules", "mugiwara-plugin-demo"),
      ),
    ).toBe(false);
    expect(await db.query.installedPlugins.findMany()).toHaveLength(0);
  });

  it("rejects symlink entries", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-symlink-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    await expect(
      service.installFromTarball(
        createPluginTarball({
          entries: [
            {
              path: "package/link",
              type: "symlink",
              linkname: "../../etc/passwd",
            },
          ],
        }),
      ),
    ).rejects.toThrow(/symlink|unsupported entry type/i);

    expect(await db.query.installedPlugins.findMany()).toHaveLength(0);
  });

  it("rejects archives without package.json", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-manifest-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    const archive = gzipSync(
      createTar([{ path: "package/README.md", content: "hi" }]),
    );

    await expect(service.installFromTarball(archive)).rejects.toThrow(
      /package\.json/i,
    );
  });

  it("rejects packages outside the approved namespace", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-name-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    await expect(
      service.installFromTarball(createPluginTarball({ name: "evil-plugin" })),
    ).rejects.toThrow(/Invalid plugin name/i);
  });

  it("rejects built-in packages and missing mugiwara metadata", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-metadata-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    await expect(
      service.installFromTarball(
        createPluginTarball({ name: "@mugiwara-manga/source-local" }),
      ),
    ).rejects.toThrow(/built-in/i);

    await expect(
      service.installFromTarball(createPluginTarball({ type: null })),
    ).rejects.toThrow(/mugiwara\.type/i);
  });

  it("installs declared dependencies with lifecycle scripts disabled", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-deps-"));
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async (args, options) => {
        calls.push({ args, cwd: options.cwd });
      },
    });
    await service.initialize();

    await service.installFromTarball(
      createPluginTarball({
        packageJson: { dependencies: { "left-pad": "1.3.0" } },
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toContain("--ignore-scripts");
    expect(calls[0]!.args).toContain("--omit=dev");
    expect(calls[0]!.args.join(" ")).toContain(
      "--registry=https://registry.npmjs.org/",
    );
    expect(calls[0]!.cwd).toContain(join(dataDir, "plugins"));
  });

  it("skips npm when the tarball already vendors node_modules", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-bundled-"));
    let npmCalls = 0;
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => {
        npmCalls += 1;
      },
    });
    await service.initialize();

    await service.installFromTarball(
      createPluginTarball({
        packageJson: { dependencies: { "left-pad": "1.3.0" } },
        entries: [
          {
            path: "package/node_modules/left-pad/package.json",
            content: JSON.stringify({ name: "left-pad", version: "1.3.0" }),
          },
        ],
      }),
    );

    expect(npmCalls).toBe(0);
  });

  it("reloads the new module after replacing a loaded plugin", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mugiwara-tarball-reload-"));
    const service = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await service.initialize();

    const manager = new PluginManager(db, join(dataDir, "plugins"));
    registerBuiltInPlugins();
    await manager.initialize();

    try {
      await service.installFromTarball(
        createPluginTarball({ entries: [pluginModule("1.0.0")] }),
      );
      await manager.enablePlugin("mugiwara-plugin-demo");
      expect(manager.getSource("demo")?.metadata.version).toBe("1.0.0");

      const result = await service.installFromTarball(
        createPluginTarball({
          version: "2.0.0",
          entries: [pluginModule("2.0.0")],
        }),
      );
      expect(result.replaced).toBe(true);

      await manager.reloadPlugin("mugiwara-plugin-demo");
      expect(manager.getSource("demo")?.metadata.version).toBe("2.0.0");
    } finally {
      await manager.shutdown();
    }
  });
});

describe("POST /api/plugins/install-tarball", () => {
  let app: ReturnType<typeof createApp>;
  let auth: AuthService;
  let installer: PluginInstallationService;
  let manager: PluginManager;
  let dataDir: string;

  beforeAll(async () => {
    await db.delete(installedPlugins);
    auth = new AuthService(db);
    dataDir = mkdtempSync(join(tmpdir(), "mugiwara-tarball-api-"));
    installer = new PluginInstallationService(db, dataDir, {
      host: "127.0.0.1",
      npmRunner: async () => undefined,
    });
    await installer.initialize();
    registerBuiltInPlugins();
    manager = new PluginManager(db, join(dataDir, "plugins"));
    await manager.initialize();

    (global as any).pluginInstaller = installer;
    (global as any).pluginManager = manager;

    app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
  });

  beforeEach(async () => {
    await db.delete(installedPlugins);
  });

  afterAll(async () => {
    await manager.shutdown();
    delete (global as any).pluginInstaller;
    delete (global as any).pluginManager;
    closeDatabase();
  });

  async function adminToken() {
    const issued = await auth.createToken("tarball device", true);
    return { Authorization: `Bearer ${issued.token}` };
  }

  it("installs, then replaces a plugin, activating the latest module", async () => {
    const token = await adminToken();

    const first = await request(app)
      .post("/api/plugins/install-tarball")
      .set(token)
      .field("confirm", "true")
      .attach(
        "tarball",
        createPluginTarball({ entries: [pluginModule("1.0.0")] }),
        "demo-1.0.0.tgz",
      )
      .expect(201);

    expect(first.body.replaced).toBe(false);
    expect(first.body.plugin).toMatchObject({
      id: "mugiwara-plugin-demo",
      version: "1.0.0",
      type: "source",
    });
    expect(manager.getSource("demo")?.metadata.version).toBe("1.0.0");

    const second = await request(app)
      .post("/api/plugins/install-tarball")
      .set(token)
      .field("confirm", "true")
      .attach(
        "tarball",
        createPluginTarball({
          version: "2.0.0",
          entries: [pluginModule("2.0.0")],
        }),
        "demo-2.0.0.tgz",
      )
      .expect(201);

    expect(second.body.replaced).toBe(true);
    expect(second.body.plugin.version).toBe("2.0.0");
    expect(manager.getSource("demo")?.metadata.version).toBe("2.0.0");

    const rows = await db.query.installedPlugins.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version).toBe("2.0.0");
  });

  it("requires confirmation and an authenticated admin", async () => {
    const token = await adminToken();

    await request(app)
      .post("/api/plugins/install-tarball")
      .set(token)
      .attach("tarball", createPluginTarball(), "demo.tgz")
      .expect(400);

    await request(app)
      .post("/api/plugins/install-tarball")
      .field("confirm", "true")
      .attach("tarball", createPluginTarball(), "demo.tgz")
      .expect(401);
  });
});
