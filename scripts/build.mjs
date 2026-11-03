#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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

function run(cmd, cwd = ROOT) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function clean(dir) {
  if (existsSync(dir)) {
    console.log(`Cleaning ${dir}...`);
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
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
    const flagMap = { linux: '--linux', win: '--win', mac: '--mac' };
    const flag = flagMap[os];
    const distDir = join(ROOT, 'dist', 'desktop', os);

    clean(distDir);

    run('pnpm build:server:deploy');
    run('pnpm turbo build --filter=@mugiwara-manga/desktop');

    run(
      `npx electron-builder ${flag} -c.extraMetadata.version="${version}" -c.directories.output="../../dist/desktop/${os}"`,
      join(ROOT, 'apps', 'desktop'),
    );

    const tarName = `mugiwara-${os}-${version}.tar.gz`;
    const tarPath = join(ROOT, 'dist', 'desktop', tarName);
    console.log(`\nCompressing to ${tarPath}...`);
    run(`tar -czf "${tarPath}" --transform "s,^${os},mugiwara," -C "${join(ROOT, 'dist', 'desktop')}" "${os}"`);

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
