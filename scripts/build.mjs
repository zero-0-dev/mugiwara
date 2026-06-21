#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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
  console.error('Targets: desktop:linux | desktop:win | app:android');
  process.exit(1);
}

const version = getVersion();
console.log(`Building ${target} — version ${version}`);

switch (target) {
  case 'desktop:linux':
  case 'desktop:win': {
    const os = target.split(':')[1];
    const flag = os === 'linux' ? '--linux' : '--win';
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

  case 'app:android': {
    if (!process.env.ANDROID_HOME) {
      console.error('Error: ANDROID_HOME is not set. Make sure the Android SDK is installed and ANDROID_HOME is configured.');
      process.exit(1);
    }

    const distDir = join(ROOT, 'dist', 'app', 'android');
    clean(distDir);

    if (!existsSync(join(ROOT, 'apps', 'mobile', 'android'))) {
      run('npx expo prebuild --platform android', join(ROOT, 'apps', 'mobile'));
    }

    const rnDir = execSync(
      'node -e "console.log(path.dirname(require.resolve(\'react-native/package.json\')))"',
      { cwd: join(ROOT, 'apps', 'mobile'), encoding: 'utf8' },
    ).trim();

    const workletsDir = execSync(
      'node -e "console.log(path.dirname(require.resolve(\'react-native-worklets/package.json\')))"',
      { cwd: join(ROOT, 'apps', 'mobile', 'node_modules', 'react-native-reanimated'), encoding: 'utf8' },
    ).trim();

    const buildGradle = join(ROOT, 'apps', 'mobile', 'android', 'app', 'build.gradle');
    let gradleContent = readFileSync(buildGradle, 'utf8');
    if (gradleContent.includes('// root = file("../../")')) {
      gradleContent = gradleContent.replace('// root = file("../../")', 'root = file("../../")');
      writeFileSync(buildGradle, gradleContent);
    }

    run(
      `./gradlew assembleRelease -PREACT_NATIVE_NODE_MODULES_DIR="${rnDir}" -PREACT_NATIVE_WORKLETS_NODE_MODULES_DIR="${workletsDir}"`,
      join(ROOT, 'apps', 'mobile', 'android'),
    );

    const apkSource = join(ROOT, 'apps', 'mobile', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    const apkDest = join(distDir, `mugiwara-${version}.apk`);

    if (!existsSync(apkSource)) {
      console.error(`Error: APK not found at ${apkSource}`);
      process.exit(1);
    }

    copyFileSync(apkSource, apkDest);

    const tarName = `mugiwara-android-${version}.tar.gz`;
    const tarPath = join(distDir, '..', tarName);
    console.log(`\nCompressing to ${tarPath}...`);
    run(`tar -czf "${tarPath}" --transform "s,^android,mugiwara," -C "${join(distDir, '..')}" "android"`);

    console.log(`\nDone: ${apkDest} (${tarName})`);
    break;
  }

  default:
    console.error(`Unknown target: "${target}"`);
    console.error('Targets: desktop:linux | desktop:win | app:android');
    process.exit(1);
}
