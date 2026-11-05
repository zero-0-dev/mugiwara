#!/usr/bin/env node
/**
 * Captures the screens used to review UI changes without committing images.
 *
 *   MUGIWARA_UI_URL=http://127.0.0.1:3001 \
 *   MUGIWARA_UI_TOKEN=<paired-device-token> \
 *   MUGIWARA_UI_OUT=/tmp/mugiwara-ui pnpm screens
 *
 * The target server needs a library with at least one manga so the detail,
 * reader and add-manga screens can be reached. Images stay in MUGIWARA_UI_OUT.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.MUGIWARA_UI_URL || "http://127.0.0.1:3001";
const TOKEN = process.env.MUGIWARA_UI_TOKEN || "";
const OUT = process.env.MUGIWARA_UI_OUT || "/tmp/mugiwara-ui";
const SOURCE_PATH = process.env.MUGIWARA_UI_SOURCE_PATH || "";

if (!TOKEN) {
  console.error("MUGIWARA_UI_TOKEN is required (a paired-device token).");
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function open(viewport, dark, authed = true) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ base, token, authed }) => {
      if (authed) {
        localStorage.setItem("mugiwara.serverUrl", base);
        localStorage.setItem(`mugiwara.authToken:${base}`, token);
        localStorage.setItem(
          "mugiwara.deviceId",
          "11111111-1111-4111-8111-111111111111",
        );
      }
    },
    { base: BASE, token: TOKEN, authed },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.route("**/api/settings", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json["ui.theme"] = dark ? "dark" : "light";
    await route.fulfill({ response, json });
  });
  return { context, page };
}

async function save(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`saved ${name}.png`);
}

async function capture(viewport, label, dark) {
  const suffix = dark ? "dark" : "light";
  const { context, page } = await open(viewport, dark);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Library", exact: true }).waitFor();
  await save(page, `${label}-library-${suffix}`);

  const card = page.locator('[aria-label^="Open "]').first();
  if (!(await card.count())) {
    await context.close();
    return;
  }

  await card.click();
  await page.getByRole("heading", { name: "Chapters", exact: true }).waitFor();
  await save(page, `${label}-manga-detail-${suffix}`);
  await page.screenshot({
    path: join(OUT, `${label}-manga-detail-tracking-${suffix}.png`),
    fullPage: true,
  });
  console.log(`saved ${label}-manga-detail-tracking-${suffix}.png`);

  await page
    .getByRole("button", { name: /Start reading|Continue reading|Read Again/i })
    .first()
    .click();
  await page.waitForTimeout(1000);
  await save(page, `${label}-reader-${suffix}`);
  await page.getByRole("button", { name: "Back", exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Back to Library/i }).click();

  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Reading Preferences", exact: true })
    .waitFor();
  await save(page, `${label}-settings-reading-${suffix}`);
  for (const [tab, name] of [
    ["Categories", "categories"],
    ["Downloads", "downloads"],
    ["Tracking", "tracking"],
    ["Storage", "storage"],
    ["Plugins", "plugins"],
    ["Queue", "queue"],
    ["Security", "security"],
    ["About", "about"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await save(page, `${label}-settings-${name}-${suffix}`);

    if (tab === "Storage") {
      // Disk space manager: reached from Settings -> Storage.
      await page.getByRole("button", { name: /Manage disk space/i }).click();
      await page
        .getByRole("heading", { name: "Disk Space", exact: true })
        .waitFor();
      await save(page, `${label}-disk-space-${suffix}`);

      // Destructive actions always require confirmation; capture that state
      // without deleting any data.
      const deleteButton = page
        .getByRole("button", { name: /Delete all downloads/i })
        .first();
      if (
        (await deleteButton.count()) > 0 &&
        (await deleteButton.isEnabled())
      ) {
        await deleteButton.click();
        await page.getByRole("dialog").waitFor();
        await save(page, `${label}-disk-space-confirm-${suffix}`);
        await page
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
      }

      await page
        .getByRole("button", { name: "Back", exact: true })
        .first()
        .click();
      // Back from /disk-space returns to /settings/storage, not the default
      // Reading tab.
      await page
        .getByRole("heading", { name: "Storage Backends", exact: true })
        .waitFor();
    }
  }

  await page.getByRole("button", { name: "Back", exact: true }).first().click();

  await page
    .getByRole("button", { name: "Discover", exact: true })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await save(page, `${label}-discover-${suffix}`);
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();

  await page.getByRole("button", { name: /Add Manga/ }).click();
  await page
    .getByRole("heading", { name: /Add Manga/ })
    .first()
    .waitFor();
  await save(page, `${label}-add-manga-${suffix}`);

  if (SOURCE_PATH) {
    await page.getByLabel("Local folder path").fill(SOURCE_PATH);
    await page.getByLabel("Local folder path").press("Enter");
    await page.waitForTimeout(800);
    await save(page, `${label}-add-manga-results-${suffix}`);
  }

  await page.keyboard.press("Escape");
  await context.close();
}

await capture({ width: 1280, height: 860 }, "desktop", true);
await capture({ width: 1280, height: 860 }, "desktop", false);
await capture({ width: 390, height: 844 }, "mobile", true);
await capture({ width: 390, height: 844 }, "mobile", false);

const setup = await open({ width: 1280, height: 860 }, true, false);
await setup.page.goto(BASE, { waitUntil: "networkidle" });
await setup.page
  .getByRole("heading", { name: "Connect to Mugiwara", exact: true })
  .waitFor();
await save(setup.page, "desktop-server-setup-dark");
await setup.context.close();

await browser.close();
console.log(`\nScreenshots written to ${OUT}`);
