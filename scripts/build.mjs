#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

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

// The packaged desktop app runs the embedded server on Electron's bundled Node
// runtime (ELECTRON_RUN_AS_NODE). Native addons must therefore be compiled for
// Electron's ABI instead of the build machine's system Node.
function rebuildServerNativeModules(arch) {
  const deployDir = join(ROOT, 'apps', 'server', 'deploy');
  const betterSqliteDir = join(
    deployDir,
    'node_modules',
    'better-sqlite3',
  );
  const electronPkg = join(
    ROOT,
    'apps',
    'desktop',
    'node_modules',
    'electron',
    'package.json',
  );

  if (!existsSync(betterSqliteDir)) {
    console.error(
      'Error: apps/server/deploy is missing better-sqlite3. Run `pnpm build:server:deploy` first.',
    );
    process.exit(1);
  }
  if (!existsSync(electronPkg)) {
    console.error('Error: Electron is not installed. Run `pnpm install` first.');
    process.exit(1);
  }

  // pnpm deploy creates a self-link to the workspace project. It points outside
  // the deploy directory and breaks once the folder is copied into the app's
  // resources, so drop it before packaging.
  rmSync(join(deployDir, 'node_modules', '@mugiwara-manga', 'server'), {
    recursive: true,
    force: true,
  });

  const electronVersion = JSON.parse(readFileSync(electronPkg, 'utf8')).version;
  // Resolve prebuild-install from the deployed better-sqlite3 so the download
  // only ever touches the package we are about to ship. Walking the workspace
  // (for example with @electron/rebuild) can rewrite the developer's own
  // node_modules copy for Electron's ABI and break local dev/tests.
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
    `\nFetching better-sqlite3 prebuild for Electron ${electronVersion} (${process.platform}-${arch})...`,
  );
  try {
    run(
      `node "${prebuildInstall}" --runtime=electron --target=${electronVersion} --arch=${arch} --platform=${process.platform}`,
      betterSqliteDir,
    );
  } catch {
    console.error(
      `\nError: better-sqlite3 has no Electron ${electronVersion} (${process.platform}-${arch}) prebuild.\n` +
        'Upgrade better-sqlite3 or pick an Electron version that has a matching prebuild.',
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
    rebuildServerNativeModules(arch);
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
