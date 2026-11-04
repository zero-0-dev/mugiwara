import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  auditLogs,
  authTokens,
  closeDatabase,
  db,
  initDatabase,
  installedPlugins,
} from "../src/database";
import { createApp } from "../src/app";
import { AuthService } from "../src/auth/service";
import { hashToken } from "../src/auth/crypto";
import { PluginInstallationService } from "../src/plugins/installation";

let app: ReturnType<typeof createApp>;
let auth: AuthService;

async function makeToken(label = "test device", isAdmin = true) {
  return auth.createToken(label, isAdmin);
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

beforeAll(() => {
  initDatabase();
  auth = new AuthService(db);
  app = createApp({ authService: auth, webDir: null, host: "127.0.0.1" });
});

beforeEach(async () => {
  await db.delete(authTokens);
  await db.delete(auditLogs);
  await db.delete(installedPlugins);
});

afterAll(() => {
  closeDatabase();
});

describe("authentication", () => {
  it("keeps /api/health public but rejects protected routes without a token", async () => {
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.status).toBe("ok");
    expect(health.body.authRequired).toBe(true);

    const denied = await request(app).get("/api/library/filter").expect(401);
    expect(denied.body).toEqual({ error: "Unauthorized" });
    expect(denied.headers["www-authenticate"]).toContain("Bearer");
  });

  it("accepts a valid token and returns device metadata", async () => {
    const issued = await makeToken("Pixel 9");
    const response = await request(app)
      .get("/api/auth/me")
      .set(bearer(issued.token))
      .expect(200);

    expect(response.body.isAdmin).toBe(true);
    expect(response.body.device.label).toBe("Pixel 9");
  });

  it("rejects invalid and revoked tokens", async () => {
    await request(app)
      .get("/api/auth/me")
      .set(bearer("mgt_definitely-not-a-real-token-value"))
      .expect(401);

    const issued = await makeToken("Revoked device");
    await request(app)
      .get("/api/auth/me")
      .set(bearer(issued.token))
      .expect(200);

    await auth.revokeToken(issued.record.id);

    await request(app)
      .get("/api/auth/me")
      .set(bearer(issued.token))
      .expect(401);
  });

  it("rejects an expired token", async () => {
    const shortLived = new AuthService(db, { tokenTtlMs: -1000 });
    const issued = await shortLived.createToken("Expired device");

    const response = await request(app)
      .get("/api/auth/me")
      .set(bearer(issued.token))
      .expect(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 for authenticated non-admin devices on admin routes", async () => {
    const reader = await makeToken("Read only", false);
    const response = await request(app)
      .post("/api/plugins/install")
      .set(bearer(reader.token))
      .send({ packageName: "mugiwara-plugin-example", confirm: true })
      .expect(403);

    expect(response.body).toEqual({ error: "Admin access required" });
  });

  it("stores only a SHA-256 hash plus device metadata", async () => {
    const issued = await makeToken("Hash check");
    const rows = await db.select().from(authTokens);
    const row = rows.find((candidate) => candidate.id === issued.record.id);

    expect(row).toBeDefined();
    expect(row?.tokenHash).toBe(hashToken(issued.token));
    expect(row?.tokenHash).not.toBe(issued.token);
    expect(row?.deviceLabel).toBe("Hash check");
    expect(row?.createdAt).toBeTruthy();
    expect(row?.revokedAt).toBeNull();
  });

  it("pairs with a short-lived code, sets an HttpOnly cookie, and logs out all devices", async () => {
    const init = await request(app).post("/api/auth/pairing/init").expect(200);
    expect(init.body.code).toMatch(/^[A-Z2-9]{8}$/);

    const pair = await request(app)
      .post("/api/auth/pair")
      .send({ code: init.body.code, deviceLabel: "Browser" })
      .expect(201);

    expect(pair.body.token).toMatch(/^mgt_/);
    const setCookie = pair.headers["set-cookie"];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie!.split(";")[0]!)
      .expect(200);

    const logoutAll = await request(app)
      .post("/api/auth/logout-all")
      .set(bearer(pair.body.token))
      .expect(200);
    expect(logoutAll.body.revokedDevices).toBe(1);

    await request(app)
      .get("/api/auth/me")
      .set(bearer(pair.body.token))
      .expect(401);
  });

  it("does not accept a pairing code twice", async () => {
    const init = await request(app).post("/api/auth/pairing/init").expect(200);
    await request(app)
      .post("/api/auth/pair")
      .send({ code: init.body.code, deviceLabel: "First" })
      .expect(201);

    await request(app)
      .post("/api/auth/pair")
      .send({ code: init.body.code, deviceLabel: "Second" })
      .expect(401);
  });

  it("rotates the current token and invalidates the previous one", async () => {
    const issued = await makeToken("Rotating device");
    const rotated = await request(app)
      .post("/api/auth/rotate")
      .set(bearer(issued.token))
      .expect(200);

    expect(rotated.body.token).toMatch(/^mgt_/);
    expect(rotated.body.token).not.toBe(issued.token);

    await request(app)
      .get("/api/auth/me")
      .set(bearer(issued.token))
      .expect(401);
    await request(app)
      .get("/api/auth/me")
      .set(bearer(rotated.body.token))
      .expect(200);
  });

  it("writes auth failures to the audit log without the token value", async () => {
    const secretLookingToken = "mgt_this-value-must-not-be-logged";
    await request(app)
      .get("/api/library/filter")
      .set(bearer(secretLookingToken))
      .expect(401);

    const logs = await db.select().from(auditLogs);
    const failure = logs.find((entry) => entry.event === "auth.failure");
    expect(failure).toBeDefined();
    expect(JSON.stringify(logs)).not.toContain(secretLookingToken);
  });
});

describe("content image authentication", () => {
  it("accepts a scoped content token for <img>-style requests", async () => {
    const issued = await makeToken("Image device");
    const content = await request(app)
      .post("/api/auth/content-token")
      .set(bearer(issued.token))
      .expect(200);

    const response = await request(app)
      .get(`/api/content/covers/missing.jpg?contentToken=${content.body.token}`)
      .expect(404);
    expect(response.body).toEqual({ error: "Cover image not found" });

    await request(app).get("/api/content/covers/missing.jpg").expect(401);
    await request(app)
      .get("/api/content/covers/missing.jpg?contentToken=invalid")
      .expect(401);
  });

  it("invalidates content tokens when the auth token is revoked", async () => {
    const issued = await makeToken("Image revoke");
    const content = await request(app)
      .post("/api/auth/content-token")
      .set(bearer(issued.token))
      .expect(200);

    await auth.revokeToken(issued.record.id);

    await request(app)
      .get(`/api/content/covers/missing.jpg?contentToken=${content.body.token}`)
      .expect(401);
  });
});

describe("CORS and CSRF", () => {
  it("rejects preflight from an unconfigured origin and allows known client origins", async () => {
    const rejected = await request(app)
      .options("/api/library/filter")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET")
      .expect(403);
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();

    const allowed = await request(app)
      .options("/api/library/filter")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["access-control-allow-origin"]).not.toBe("*");
  });

  it("allows the Capacitor iOS origin", async () => {
    const allowed = await request(app)
      .options("/api/auth/status")
      .set("Origin", "capacitor://localhost")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "capacitor://localhost",
    );
  });

  it("rejects form-encoded API writes and cross-site state changes", async () => {
    const issued = await makeToken("Writer");

    const form = await request(app)
      .post("/api/plugins/install")
      .set(bearer(issued.token))
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("packageName=mugiwara-plugin-x&confirm=true")
      .expect(415);
    expect(form.body.error).toContain("Form-encoded");

    await request(app)
      .put("/api/settings/ui.theme")
      .set(bearer(issued.token))
      .set("Content-Type", "application/json")
      .set("Origin", "https://evil.example")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ value: "light" })
      .expect(403);
  });

  it("allows non-browser curl-style writes with no Origin", async () => {
    const issued = await makeToken("CLI");
    const response = await request(app)
      .put("/api/settings/ui.theme")
      .set(bearer(issued.token))
      .set("Content-Type", "application/json")
      .send({ value: "light" })
      .expect(200);
    expect(response.body).toEqual({ key: "ui.theme", value: "light" });
  });

  it("accepts cross-site writes from an explicitly allowed origin", async () => {
    const issued = await makeToken("Desktop dev");
    const response = await request(app)
      .put("/api/settings/ui.theme")
      .set(bearer(issued.token))
      .set("Content-Type", "application/json")
      .set("Origin", "http://localhost:5173")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ value: "dark" })
      .expect(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(response.body).toEqual({ key: "ui.theme", value: "dark" });
  });
});

describe("plugin install hardening", () => {
  it("requires explicit confirmation", async () => {
    const issued = await makeToken("Admin");
    const response = await request(app)
      .post("/api/plugins/install")
      .set(bearer(issued.token))
      .send({ packageName: "mugiwara-plugin-example" })
      .expect(400);
    expect(response.body.error).toContain("confirmation");
  });

  it("disables installs on non-loopback hosts unless explicitly enabled", async () => {
    const root = mkdtempSync(join(tmpdir(), "mugiwara-plugin-policy-"));
    const runner = vi.fn(async () => undefined);
    const service = new PluginInstallationService(db, root, {
      host: "0.0.0.0",
      npmRunner: runner,
    });

    expect(service.getPolicy().installEnabled).toBe(false);
    await expect(
      service.install("mugiwara-plugin-example"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(runner).not.toHaveBeenCalled();

    const explicitlyEnabled = new PluginInstallationService(db, root, {
      host: "0.0.0.0",
      allowRemoteInstall: true,
      npmRunner: runner,
    });
    expect(explicitlyEnabled.getPolicy().installEnabled).toBe(true);
  });

  it("rejects packages outside an explicit allowlist", () => {
    const root = mkdtempSync(join(tmpdir(), "mugiwara-plugin-allow-"));
    const service = new PluginInstallationService(db, root, {
      host: "127.0.0.1",
      allowlist: ["mugiwara-plugin-approved"],
      npmRunner: async () => undefined,
    });

    expect(service.validatePackageName("mugiwara-plugin-approved")).toBe(
      "mugiwara-plugin-approved",
    );
    expect(() => service.validatePackageName("mugiwara-plugin-other")).toThrow(
      /allowlist/,
    );
    expect(() =>
      service.validatePackageName("mugiwara-plugin-../../etc/passwd"),
    ).toThrow();
  });

  it("runs npm install with --ignore-scripts and the approved registry", async () => {
    const root = mkdtempSync(join(tmpdir(), "mugiwara-plugin-install-"));
    let captured: string[] = [];
    const runner = async (args: string[]) => {
      captured = args;
      // Simulate npm materialising the package. The runner is injected so no
      // real npm process (and therefore no lifecycle script) is executed.
      const packageDir = join(
        root,
        "plugins",
        "node_modules",
        "mugiwara-plugin-fake",
      );
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        join(packageDir, "package.json"),
        JSON.stringify({
          name: "mugiwara-plugin-fake",
          version: "1.2.3",
          description: "test plugin",
          mugiwara: {
            type: "source",
            id: "fake",
            compatibleCore: "^1.0.0",
          },
        }),
      );
    };

    const service = new PluginInstallationService(db, root, {
      host: "127.0.0.1",
      npmRunner: runner,
    });
    await service.initialize();

    const record = await service.install("mugiwara-plugin-fake");
    expect(record.id).toBe("mugiwara-plugin-fake");
    expect(record.version).toBe("1.2.3");
    expect(captured).toContain("--ignore-scripts");
    expect(captured.join(" ")).toContain(
      "--registry=https://registry.npmjs.org/",
    );
    expect(captured).toContain("mugiwara-plugin-fake@latest");
  });

  it("exposes the install policy to authenticated clients", async () => {
    const root = mkdtempSync(join(tmpdir(), "mugiwara-plugin-policy-api-"));
    const service = new PluginInstallationService(db, root, {
      host: "0.0.0.0",
      npmRunner: async () => undefined,
    });
    (global as any).pluginInstaller = service;

    const issued = await makeToken("Policy reader");
    const response = await request(app)
      .get("/api/plugins/policy")
      .set(bearer(issued.token))
      .expect(200);
    expect(response.body.installEnabled).toBe(false);
    expect(response.body.exposedOnNetwork).toBe(true);
  });
});
