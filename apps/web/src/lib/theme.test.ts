import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_ID,
  THEME_FAMILIES,
  THEME_STORAGE_KEY,
  THEME_VARIANTS,
  applyTheme,
  paletteToCssVariables,
  resolveTheme,
} from "./theme";

// jsdom does not provide localStorage in this environment, so back it with a
// small in-memory map. `applyTheme` reads it through `window.localStorage`.
const storage = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => {
    storage.delete(key);
  },
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
};

beforeEach(() => {
  storage.clear();
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-mode");
  document.documentElement.removeAttribute("style");
});

describe("theme catalog", () => {
  it("defaults to the Mugiwara dark palette", () => {
    expect(DEFAULT_THEME_ID).toBe("mugiwara-dark");
    expect(resolveTheme(undefined).id).toBe("mugiwara-dark");
    expect(resolveTheme("not-a-theme").id).toBe("mugiwara-dark");
  });

  it("maps the legacy mode-only setting to the new default in that mode", () => {
    expect(resolveTheme("dark").id).toBe("mugiwara-dark");
    expect(resolveTheme("light").id).toBe("mugiwara-light");
  });

  it("gives every family a light and a dark variant with unique ids", () => {
    const ids = new Set<string>();

    for (const family of THEME_FAMILIES) {
      expect(family.light.mode).toBe("light");
      expect(family.dark.mode).toBe("dark");
      expect(family.light.id).toBe(`${family.id}-light`);
      expect(family.dark.id).toBe(`${family.id}-dark`);
      expect(family.light.familyId).toBe(family.id);
      expect(family.dark.familyId).toBe(family.id);

      for (const variant of [family.light, family.dark]) {
        expect(ids.has(variant.id)).toBe(false);
        ids.add(variant.id);
      }
    }

    expect(ids.size).toBe(THEME_VARIANTS.length);
  });

  it("resolves every variant by its stored id", () => {
    for (const variant of THEME_VARIANTS) {
      expect(resolveTheme(variant.id)).toBe(variant);
    }
  });

  it("expands a seed into the complete semantic token set", () => {
    const variables = paletteToCssVariables(
      resolveTheme("mugiwara-dark").palette,
    );

    expect(variables["--background"]).toBe("#17120e");
    expect(variables["--card-foreground"]).toBe("#f8efe2");
    expect(variables["--brand"]).toBe("#f39413");
    expect(variables["--brand-soft"]).toMatch(/^rgba\(/);
    expect(variables["--destructive-text"]).toMatch(/^#/);
  });
});

describe("applyTheme", () => {
  it("writes mode, palette variables and the local cache", () => {
    const variant = applyTheme("catppuccin-light");
    const root = document.documentElement;

    expect(variant.id).toBe("catppuccin-light");
    expect(root.dataset.theme).toBe("catppuccin-light");
    expect(root.dataset.mode).toBe("light");
    expect(root.style.getPropertyValue("--background")).toBe("#eff1f5");
    expect(root.style.getPropertyValue("--brand")).toBe("#8839ef");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(
      "catppuccin-light",
    );
  });

  it("normalizes legacy values before saving them", () => {
    applyTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("mugiwara-dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(
      "mugiwara-dark",
    );
  });
});
