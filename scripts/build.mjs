#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, copyFileSync, renameSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// Node.js runtime shipped inside the desktop app. It runs the embedded server
// and the `npm` used to install plugins, so it must stay in sync with the
// better-sqlite3 prebuild selected below.
const NODE_RUNTIME_VERSION = process.env.MUGIWARA_NODE_VERSION || '24.22.3';

function getVersion() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { cwd: ROOT, encoding: 'utf8' }).trim();
    return tag.replace(/^v/, '');
  } catch {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return pkg.version;
  }
}

function run(cmd, cwd = ROOT, env = process.env) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env });
}

function clean(dir) {
  if (existsSync(dir)) {
    console.log(`Cleaning ${dir}...`);
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
}

// The packaged desktop app runs the embedded server on a Node.js runtime that
// is copied into the app bundle. Doing it this way (instead of reusing
// Electron as Node) keeps `npm` available for the plugin system and decouples
// the server's Node ABI from the Electron release.
async function fetchNodeRuntime(platform, arch) {
  const isWindows = platform === 'win32';
  const name = `node-v${NODE_RUNTIME_VERSION}-${platform}-${arch}`;
  const ext = isWindows ? 'zip' : 'tar.gz';
  const baseUrl = `https://nodejs.org/dist/v${NODE_RUNTIME_VERSION}`;
  const cacheDir = join(ROOT, 'dist', 'cache', 'node');
  const archive = join(cacheDir, `${name}.${ext}`);

  mkdirSync(cacheDir, { recursive: true });

  if (!existsSync(archive)) {
    console.log(
      `\nDownloading Node.js ${NODE_RUNTIME_VERSION} (${platform}-${arch})...`,
    );
    const response = await fetch(`${baseUrl}/${name}.${ext}`);
    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download Node.js: ${response.status} ${response.statusText}`,
      );
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(archive),
    );
  }

  // Verify the official checksum even for cached downloads.
  const sumsResponse = await fetch(`${baseUrl}/SHASUMS256.txt`);
  if (!sumsResponse.ok) {
    throw new Error(
      `Failed to download Node.js checksums: ${sumsResponse.status}`,
    );
  }
  const sums = await sumsResponse.text();
  const checksumLine = sums
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.endsWith(` ${name}.${ext}`));
  if (!checksumLine) {
    throw new Error(`No checksum found for ${name}.${ext}`);
  }
  const expected = checksumLine.split(/\s+/)[0];
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) {
    hash.update(chunk);
  }
  const actual = hash.digest('hex');
  if (actual !== expected) {
    rmSync(archive, { force: true });
    throw new Error(
      `Checksum mismatch for ${name}.${ext}: expected ${expected}, got ${actual}`,
    );
  }

  const runtimeDir = join(
    ROOT,
    'apps',
    'desktop',
    'buildResources',
    'node',
  );
  const buildResources = dirname(runtimeDir);
  const extracted = join(buildResources, name);
  rmSync(runtimeDir, { recursive: true, force: true });
  rmSync(extracted, { recursive: true, force: true });

  if (isWindows) {
    run(`tar -xf "${archive}" -C "${buildResources}"`);
  } else {
    run(`tar -xzf "${archive}" -C "${buildResources}"`);
  }
  renameSync(extracted, runtimeDir);

  // Headers and man pages are not needed to run the server or npm.
  rmSync(join(runtimeDir, 'include'), { recursive: true, force: true });
  rmSync(join(runtimeDir, 'share'), { recursive: true, force: true });

  const nodeBin = join(
    runtimeDir,
    isWindows ? 'node.exe' : join('bin', 'node'),
  );
  if (!existsSync(nodeBin)) {
    throw new Error(`Bundled Node.js runtime is incomplete: ${nodeBin}`);
  }

  return { dir: runtimeDir, bin: nodeBin, version: NODE_RUNTIME_VERSION };
}

// better-sqlite3 is the only native addon that depends on the Node ABI. Fetch
// the prebuild for the *bundled* Node version so it matches the runtime shipped
// in the app, not the machine running the build.
function prepareServerNativeModules(nodeVersion, platform, arch) {
  const deployDir = join(ROOT, 'apps', 'server', 'deploy');
  const betterSqliteDir = join(
    deployDir,
    'node_modules',
    'better-sqlite3',
  );

  if (!existsSync(betterSqliteDir)) {
    console.error(
      'Error: apps/server/deploy is missing better-sqlite3. Run `pnpm build:server:deploy` first.',
    );
    process.exit(1);
  }

  // pnpm deploy creates a self-link to the workspace project. It points outside
  // the deploy directory and breaks once the folder is copied into the app's
  // resources, so drop it before packaging.
  rmSync(join(deployDir, 'node_modules', '@mugiwara-manga', 'server'), {
    recursive: true,
    force: true,
  });

  // Resolve prebuild-install from the deployed better-sqlite3 so the download
  // only ever touches the package we are about to ship.
  const requireFromBetterSqlite = createRequire(
    join(betterSqliteDir, 'package.json'),
  );
  let prebuildInstall;
  try {
    prebuildInstall = requireFromBetterSqlite.resolve(
      'prebuild-install/bin.js',
    );
  } catch {
    console.error(
      'Error: prebuild-install is not available inside the deployed better-sqlite3. Re-run `pnpm build:server:deploy`.',
    );
    process.exit(1);
  }

  // Remove the host-Node binary first so a failed download cannot silently
  // ship an ABI-mismatched module.
  rmSync(join(betterSqliteDir, 'build'), { recursive: true, force: true });

  console.log(
    `\nFetching better-sqlite3 prebuild for Node ${nodeVersion} (${platform}-${arch})...`,
  );
  try {
    run(
      `node "${prebuildInstall}" --runtime=node --target=${nodeVersion} --arch=${arch} --platform=${platform}`,
      betterSqliteDir,
    );
  } catch {
    console.error(
      `\nError: better-sqlite3 has no Node ${nodeVersion} (${platform}-${arch}) prebuild.\n` +
        'Upgrade better-sqlite3 or choose a Node.js version that has a matching prebuild.',
    );
    process.exit(1);
  }
}

function archiveDir(tarPath, sourceDir, entry) {
  // BSD tar (macOS) uses -s while GNU tar (Linux) uses --transform for the
  // same "rename the top-level directory" behaviour.
  if (process.platform === 'darwin') {
    run(
      `tar -czf "${tarPath}" -s "/^${entry}/mugiwara/" -C "${sourceDir}" "${entry}"`,
    );
  } else {
    run(
      `tar -czf "${tarPath}" --transform "s,^${entry},mugiwara," -C "${sourceDir}" "${entry}"`,
    );
  }
}

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/build.mjs <target>');
  console.error('Targets: desktop:linux | desktop:win | desktop:mac | app:android | app:android:release');
  process.exit(1);
}

const version = getVersion();
console.log(`Building ${target} — version ${version}`);

switch (target) {
  case 'desktop:linux':
  case 'desktop:win':
  case 'desktop:mac': {
    const os = target.split(':')[1];
    const hostPlatform = { linux: 'linux', win: 'win32', mac: 'darwin' }[os];
    const flagMap = { linux: '--linux', win: '--win', mac: '--mac' };
    const flag = flagMap[os];
    const distDir = join(ROOT, 'dist', 'desktop', os);

    if (process.platform !== hostPlatform) {
      console.error(
        `Error: desktop:${os} must be built on ${hostPlatform}. The embedded server bundles host-specific native modules (better-sqlite3, sharp), so cross-compiling would ship binaries for the wrong OS.`,
      );
      process.exit(1);
    }

    // electron-builder defaults to the host architecture, but be explicit.
    // The architecture must match the Node.js runtime that installed the
    // server's native dependencies (pnpm resolved better-sqlite3 and sharp for
    // this host). On Apple Silicon, run the build with a native arm64 Node;
    // a Node under Rosetta reports x64 and produces an Intel package.
    const arch = process.arch;
    if (arch !== 'arm64' && arch !== 'x64') {
      console.error(
        `Error: unsupported desktop architecture "${arch}". Use an arm64 or x64 Node.js runtime.`,
      );
      process.exit(1);
    }
    if (os === 'mac' && arch === 'x64') {
      console.warn(
        '\nWarning: building an x64 (Intel) macOS package. On Apple Silicon, use a native arm64 Node.js runtime for an Apple Silicon build.',
      );
    }
    const archFlag = `--${arch}`;

    clean(distDir);

    run('pnpm build:server:deploy');
    const nodeRuntime = await fetchNodeRuntime(process.platform, arch);
    prepareServerNativeModules(nodeRuntime.version, process.platform, arch);
    run('pnpm turbo build --filter=@mugiwara-manga/desktop');

    run(
      `npx electron-builder ${flag} ${archFlag} -c.extraMetadata.version="${version}" -c.directories.output="../../dist/desktop/${os}"`,
      join(ROOT, 'apps', 'desktop'),
    );

    const tarName = `mugiwara-${os}-${version}.tar.gz`;
    const tarPath = join(ROOT, 'dist', 'desktop', tarName);
    console.log(`\nCompressing to ${tarPath}...`);
    archiveDir(tarPath, join(ROOT, 'dist', 'desktop'), os);

    console.log(`\nDone: ${distDir} (${tarName})`);
    break;
  }

  case 'app:android':
  case 'app:android:release': {
    const release = target === 'app:android:release';
    const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

    if (!androidHome) {
      console.error(
        'Error: ANDROID_HOME (or ANDROID_SDK_ROOT) is not set. Install the Android SDK and point ANDROID_HOME at it.',
      );
      process.exit(1);
    }

    const variant = release ? 'release' : 'debug';
    const distDir = join(ROOT, 'dist', 'app', 'android');
    clean(distDir);

    const mobileDir = join(ROOT, 'apps', 'mobile');
    const androidDir = join(mobileDir, 'android');
    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

    if (!existsSync(join(androidDir, 'gradlew'))) {
      console.error(
        'Error: apps/mobile/android is missing. Run `pnpm --filter @mugiwara-manga/mobile add:android` first.',
      );
      process.exit(1);
    }

    // Build the shared web client and copy it into the native project.
    run('pnpm --filter @mugiwara-manga/mobile sync:android');

    run(
      `${gradlew} assemble${release ? 'Release' : 'Debug'}`,
      androidDir,
    );

    const apkDir = join(
      androidDir,
      'app',
      'build',
      'outputs',
      'apk',
      variant,
    );
    const apks = existsSync(apkDir)
      ? readdirSync(apkDir).filter((file) => file.endsWith('.apk'))
      : [];
    const apkSource = apks
      .map((file) => join(apkDir, file))
      .sort((a, b) => {
        // Prefer a signed/standard release APK over an unsigned one.
        const score = (path) =>
          path.endsWith('-unsigned.apk') ? 0 : path.endsWith('-debug.apk') ? 2 : 1;
        return score(b) - score(a);
      })[0];

    if (!apkSource) {
      console.error(`Error: no ${variant} APK found in ${apkDir}`);
      process.exit(1);
    }

    const apkName = `mugiwara-${version}-${variant}.apk`;
    const apkDest = join(distDir, apkName);
    copyFileSync(apkSource, apkDest);

    const tarName = `mugiwara-android-${version}-${variant}.tar.gz`;
    const tarPath = join(distDir, '..', tarName);
    console.log(`\nCompressing to ${tarPath}...`);
    run(`tar -czf "${tarPath}" -C "${distDir}" .`);

    console.log(`\nDone: ${apkDest}`);
    console.log(`       (${tarName})`);
    if (release && /-unsigned\.apk$/.test(apkSource)) {
      console.warn(
        '\n⚠️  The release APK is unsigned. Configure a keystore or use the debug APK for sideloading.',
      );
    }
    break;
  }

  default:
    console.error(`Unknown target: "${target}"`);
    console.error('Targets: desktop:linux | desktop:win | desktop:mac | app:android | app:android:release');
    process.exit(1);
}
