import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  buildTrackerEnvironment,
  providerConfigured,
} from "../src/trackers/config";
import { readBakedTrackerConfig } from "../src/trackers/builtin-config";

const directory = mkdtempSync(join(tmpdir(), "mugiwara-tracker-config-"));

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("baked tracker configuration", () => {
  it("uses baked credentials when no runtime environment is present", () => {
    const env = buildTrackerEnvironment(
      {},
      {
        anilistClientId: "baked-anilist-id",
        anilistClientSecret: "baked-anilist-secret",
        malClientId: "baked-mal-id",
        malRedirectUri: "http://127.0.0.1:3001/callback",
      },
    );

    expect(env.anilistClientId).toBe("baked-anilist-id");
    expect(env.anilistClientSecret).toBe("baked-anilist-secret");
    expect(env.malClientId).toBe("baked-mal-id");
    expect(env.malRedirectUri).toBe("http://127.0.0.1:3001/callback");
    expect(providerConfigured("anilist", env)).toBe(true);
    expect(providerConfigured("myanimelist", env)).toBe(true);
  });

  it("lets runtime variables override baked values for custom builds", () => {
    const env = buildTrackerEnvironment(
      {
        MUGIWARA_ANILIST_CLIENT_ID: "runtime-anilist-id",
        MUGIWARA_ANILIST_CLIENT_SECRET: "runtime-secret",
        MUGIWARA_MAL_CLIENT_ID: "runtime-mal-id",
      },
      {
        anilistClientId: "baked-anilist-id",
        anilistClientSecret: "baked-secret",
        malClientId: "baked-mal-id",
      },
    );

    expect(env.anilistClientId).toBe("runtime-anilist-id");
    expect(env.anilistClientSecret).toBe("runtime-secret");
    expect(env.malClientId).toBe("runtime-mal-id");
  });

  it("treats empty runtime variables as unset and falls back to baked values", () => {
    const env = buildTrackerEnvironment(
      { MUGIWARA_ANILIST_CLIENT_ID: "   " },
      { anilistClientId: "baked-anilist-id" },
    );
    expect(env.anilistClientId).toBe("baked-anilist-id");
  });

  it("reads the generated build file and ignores malformed values", () => {
    const filePath = join(directory, "builtin-trackers.json");
    writeFileSync(
      filePath,
      JSON.stringify({
        anilistClientId: " baked-anilist-id ",
        anilistClientSecret: 42,
        malClientId: "",
        malUserAgent: "Mugiwara test",
      }),
    );

    const baked = readBakedTrackerConfig(filePath);
    expect(baked.anilistClientId).toBe("baked-anilist-id");
    expect(baked.anilistClientSecret).toBeUndefined();
    expect(baked.malClientId).toBeUndefined();
    expect(baked.malUserAgent).toBe("Mugiwara test");
  });

  it("returns an empty configuration when the file is missing", () => {
    expect(
      readBakedTrackerConfig(join(directory, "does-not-exist.json")),
    ).toEqual({
      anilistClientId: undefined,
      anilistClientSecret: undefined,
      anilistRedirectUri: undefined,
      malClientId: undefined,
      malClientSecret: undefined,
      malRedirectUri: undefined,
      malUserAgent: undefined,
    });
  });
});
