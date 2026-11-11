#!/usr/bin/env node
/**
 * Regenerates every app icon/splash from the master logo.
 *
 * Source of truth: assets/branding/mugiwara-logo.png (1024x1024, wordmark).
 * The mark (straw hat + book, no wordmark) is detected automatically by
 * finding the first horizontal gap in the artwork, so the wordmark is never
 * baked into small icons.
 *
 * Run with: node scripts/generate-brand-assets.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const masterPath = path.join(root, "assets/branding/mugiwara-logo.png");
const brandingDir = path.join(root, "assets/branding");
const webPublic = path.join(root, "apps/web/public");
const webSrcAssets = path.join(root, "apps/web/src/assets");
const desktopResources = path.join(root, "apps/desktop/buildResources");
const androidRes = path.join(root, "apps/mobile/android/app/src/main/res");
const iosAssets = path.join(
  root,
  "apps/mobile/ios/App/App/Assets.xcassets",
);

if (!existsSync(masterPath)) {
  throw new Error(`Missing master logo at ${masterPath}`);
}

const BACKGROUND = "#f39412";

async function detectMarkBounds(file) {
  const { data, info } = await sharp(file)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const background = [data[0], data[1], data[2]];

  const isInk = (x, y) => {
    const i = (y * width + x) * channels;
    return (
      Math.abs(data[i] - background[0]) +
        Math.abs(data[i + 1] - background[1]) +
        Math.abs(data[i + 2] - background[2]) >
      60
    );
  };

  const rowHasInk = [];
  for (let y = 0; y < height; y++) {
    let found = false;
    for (let x = 0; x < width && !found; x++) found = isInk(x, y);
    rowHasInk.push(found);
  }

  const firstRow = rowHasInk.indexOf(true);
  if (firstRow === -1) throw new Error("Logo appears to be blank");

  // The wordmark sits below the mark, separated by a band of background.
  // Stop the mark at the first gap of at least 20 rows.
  let markBottom = height - 1;
  let gap = 0;
  for (let y = firstRow; y < height; y++) {
    if (rowHasInk[y]) {
      gap = 0;
      markBottom = y;
    } else {
      gap++;
      if (gap >= 20) {
        markBottom = y - gap;
        break;
      }
    }
  }

  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = firstRow; y <= markBottom; y++) {
    for (let x = 0; x < width; x++) {
      if (!isInk(x, y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

const bounds = await detectMarkBounds(masterPath);
const markSide = Math.round(Math.max(bounds.width, bounds.height) * 1.1);

/** The mark only, on a square orange field (no wordmark). */
async function buildMark(size = 1024, artScale = 0.82) {
  const art = await sharp(masterPath)
    .extract(bounds)
    .resize({
      width: Math.round(size * artScale),
      height: Math.round(size * artScale),
      fit: "inside",
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toBuffer();
}

/** The mark on a transparent canvas, sized for an Android adaptive foreground. */
async function buildAdaptiveForeground(size) {
  const mark = await buildMark(Math.round(size * 0.74));
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toBuffer();
}

/** The full lockup (mark + wordmark) centered on an orange splash canvas. */
async function buildSplash(width, height, scale = 0.46) {
  const logoSize = Math.round(Math.min(width, height) * scale);
  const logo = await sharp(masterPath).resize(logoSize, logoSize).png().toBuffer();
  return sharp({
    create: { width, height, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

function roundMask(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
}

async function write(file, buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer);
  console.log("  " + path.relative(root, file));
}

console.log("Brand mark:", bounds, "-> square", markSide);

const mark1024 = await buildMark(1024);
await write(path.join(brandingDir, "mugiwara-mark.png"), mark1024);
await write(
  path.join(webSrcAssets, "mugiwara-mark.png"),
  await sharp(mark1024).resize(256, 256).png().toBuffer(),
);
await write(path.join(desktopResources, "icon.png"), mark1024);

// ---- Web (browser, PWA, and the shared UI) -------------------------------
const webIcons = [
  ["favicon-16.png", 16],
  ["favicon-32.png", 32],
  ["favicon-48.png", 48],
  ["apple-touch-icon.png", 180],
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512],
];
for (const [name, size] of webIcons) {
  await write(
    path.join(webPublic, name),
    await sharp(mark1024).resize(size, size).png().toBuffer(),
  );
}

// Maskable icons need their artwork inside the safe zone.
const maskableMark = await buildMark(760);
await write(
  path.join(webPublic, "icons/icon-maskable-512.png"),
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BACKGROUND },
  })
    .composite([
      {
        input: await sharp(maskableMark).resize(380, 380).png().toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer(),
);

const icoPngs = await Promise.all(
  [16, 32, 48].map((size) =>
    sharp(mark1024).resize(size, size).png().toBuffer(),
  ),
);
const icoTmp = path.join(webPublic, ".favicon");
for (let i = 0; i < icoPngs.length; i++) {
  await write(path.join(icoTmp, `favicon-${[16, 32, 48][i]}.png`), icoPngs[i]);
}
try {
  execFileSync("magick", [
    path.join(icoTmp, "favicon-48.png"),
    "-define",
    "icon:auto-resize=48,32,16",
    path.join(webPublic, "favicon.ico"),
  ]);
  console.log("  apps/web/public/favicon.ico");
} catch {
  console.warn("  ! ImageMagick not found; skipped favicon.ico");
}
execFileSync("rm", ["-rf", icoTmp]);

const manifest = {
  name: "Mugiwara Manga Reader",
  short_name: "Mugiwara",
  description: "Self-hosted manga reader",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: BACKGROUND,
  theme_color: "#17120e",
  icons: [
    { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "./icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};
await write(
  path.join(webPublic, "manifest.webmanifest"),
  Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
);

// ---- Android ------------------------------------------------------------
const androidDensities = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];
for (const [density, iconSize, foregroundSize] of androidDensities) {
  const dir = path.join(androidRes, `mipmap-${density}`);
  await write(
    path.join(dir, "ic_launcher.png"),
    await sharp(await buildMark(iconSize)).png().toBuffer(),
  );
  await write(
    path.join(dir, "ic_launcher_round.png"),
    await sharp(await buildMark(iconSize, 0.68))
      .composite([{ input: roundMask(iconSize), blend: "dest-in" }])
      .png()
      .toBuffer(),
  );
  await write(
    path.join(dir, "ic_launcher_foreground.png"),
    await buildAdaptiveForeground(foregroundSize),
  );
}

const androidSplashes = [
  ["drawable/splash.png", 480, 320],
  ["drawable-land-mdpi/splash.png", 480, 320],
  ["drawable-land-hdpi/splash.png", 800, 480],
  ["drawable-land-xhdpi/splash.png", 1280, 720],
  ["drawable-land-xxhdpi/splash.png", 1600, 960],
  ["drawable-land-xxxhdpi/splash.png", 1920, 1280],
  ["drawable-port-mdpi/splash.png", 320, 480],
  ["drawable-port-hdpi/splash.png", 480, 800],
  ["drawable-port-xhdpi/splash.png", 720, 1280],
  ["drawable-port-xxhdpi/splash.png", 960, 1600],
  ["drawable-port-xxxhdpi/splash.png", 1280, 1920],
];
for (const [file, width, height] of androidSplashes) {
  await write(
    path.join(androidRes, file),
    await buildSplash(width, height),
  );
}

await write(
  path.join(androidRes, "values/ic_launcher_background.xml"),
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F39412</color>\n</resources>\n`,
  ),
);

// ---- iOS ----------------------------------------------------------------
// iOS rejects app icons that carry an alpha channel, so flatten explicitly.
await write(
  path.join(iosAssets, "AppIcon.appiconset/AppIcon-512@2x.png"),
  await sharp(mark1024)
    .flatten({ background: BACKGROUND })
    .removeAlpha()
    .resize(1024, 1024)
    .png()
    .toBuffer(),
);
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  await write(
    path.join(iosAssets, "Splash.imageset", name),
    await buildSplash(2732, 2732, 0.42),
  );
}

console.log("Done.");
