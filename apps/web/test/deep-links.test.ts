import { describe, expect, it } from "vitest";
import { appUrlToPath } from "../src/platform/deepLinks";

describe("appUrlToPath", () => {
  it("keeps the path and query for web/app links", () => {
    expect(appUrlToPath("https://manga.example/read/m1/c2?page=4")).toBe(
      "/read/m1/c2?page=4",
    );
  });

  it("turns a custom scheme host into a route", () => {
    expect(appUrlToPath("mugiwara://manga/m1")).toBe("/manga/m1");
    expect(appUrlToPath("mugiwara://settings/queue")).toBe(
      "/settings/queue",
    );
    expect(appUrlToPath("mugiwara:///discover/42")).toBe("/discover/42");
  });

  it("falls back to the root for the bare scheme", () => {
    expect(appUrlToPath("mugiwara://")).toBe("/");
  });

  it("rejects non-URL input", () => {
    expect(appUrlToPath("not a url")).toBeNull();
  });
});
