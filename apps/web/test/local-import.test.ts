import { describe, expect, it, vi } from "vitest";
import {
  formatImportError,
  getLocalImportEnvironment,
  getLocalPathHint,
  isLikelyLocalPath,
  pickLocalFolder,
} from "../src/platform/localImport";

function stubElectron(selectFolder: () => Promise<string | null>) {
  (window as any).electronAPI = {
    getServerPort: vi.fn(),
    getApiUrl: vi.fn().mockResolvedValue(""),
    getAppVersion: vi.fn(),
    selectFolder,
    openFolder: vi.fn(),
    platform: "linux",
  };
}

describe("local import platform helpers", () => {
  it("opens the Electron folder picker and trims the selected path", async () => {
    const selectFolder = vi.fn().mockResolvedValue(" /srv/manga/My Manga ");
    stubElectron(selectFolder);

    await expect(pickLocalFolder()).resolves.toBe("/srv/manga/My Manga");
    expect(selectFolder).toHaveBeenCalledTimes(1);

    const env = getLocalImportEnvironment();
    expect(env.context).toBe("electron");
    expect(env.hasFolderPicker).toBe(true);
  });

  it("returns null when the picker is cancelled", async () => {
    stubElectron(vi.fn().mockResolvedValue(null));
    await expect(pickLocalFolder()).resolves.toBeNull();
  });

  it("returns null when no native picker exists", async () => {
    await expect(pickLocalFolder()).resolves.toBeNull();

    const env = getLocalImportEnvironment();
    expect(env.context).toBe("web");
    expect(env.hasFolderPicker).toBe(false);
  });

  it("describes web and Capacitor paths as server paths", () => {
    expect(getLocalPathHint("web")).toMatch(/server machine/i);
    expect(getLocalPathHint("capacitor")).toMatch(/server machine/i);
    expect(getLocalPathHint("capacitor")).toMatch(/phone/i);
    expect(getLocalPathHint("electron")).toMatch(/this computer/i);
  });

  it("detects path-shaped local input but not title searches", () => {
    expect(isLikelyLocalPath("/srv/manga")).toBe(true);
    expect(isLikelyLocalPath("C:\\manga\\One Piece")).toBe(true);
    expect(isLikelyLocalPath("~/manga")).toBe(true);
    expect(isLikelyLocalPath("One Piece")).toBe(false);
  });

  it("turns storage and chapter errors into actionable import messages", () => {
    expect(formatImportError(new Error("No default storage backend configured"))).toMatch(
      /Settings → Storage/,
    );
    expect(formatImportError(new Error("No chapters were found"))).toMatch(
      /chapter subfolders/,
    );
    expect(formatImportError(new Error("Cannot reach the Mugiwara server."))).toMatch(
      /Cannot reach/,
    );
  });
});
