import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveNpmCli } from "../src/plugins/installation";

describe("resolveNpmCli", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "mugiwara-npm-"));
    dirs.push(dir);
    return dir;
  }

  it("runs the npm CLI shipped with a Unix Node.js runtime", () => {
    const runtime = tempDir();
    const cli = join(runtime, "lib", "node_modules", "npm", "bin", "npm-cli.js");
    mkdirSync(join(runtime, "lib", "node_modules", "npm", "bin"), {
      recursive: true,
    });
    writeFileSync(cli, "");
    const node = join(runtime, "bin", "node");

    expect(resolveNpmCli(node, "linux")).toEqual({
      command: node,
      args: [cli],
      shell: false,
    });
  });

  it("runs the npm CLI shipped with a Windows Node.js runtime", () => {
    const runtime = tempDir();
    const cli = join(runtime, "node_modules", "npm", "bin", "npm-cli.js");
    mkdirSync(join(runtime, "node_modules", "npm", "bin"), {
      recursive: true,
    });
    writeFileSync(cli, "");
    const node = join(runtime, "node.exe");

    expect(resolveNpmCli(node, "win32")).toEqual({
      command: node,
      args: [cli],
      shell: false,
    });
  });

  it("falls back to npm on PATH when the runtime has no bundled npm", () => {
    const runtime = tempDir();
    const node = join(runtime, "bin", "node");

    expect(resolveNpmCli(node, "linux")).toEqual({
      command: "npm",
      args: [],
      shell: false,
    });
    expect(resolveNpmCli(node, "win32")).toEqual({
      command: "npm.cmd",
      args: [],
      shell: true,
    });
  });
});
