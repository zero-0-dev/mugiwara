# Mugiwara

Self-hosted manga reader. One shared web client (`apps/web`) runs in a browser,
inside the Electron desktop shell, and inside the Capacitor mobile shell. The
Node server (`apps/server`) owns the library, files, plugins, queue, and SQLite
database.

## Architecture

```
apps/server       Express API + SQLite + plugins + queue; also serves the web build
apps/web          The single React UI (also used by desktop and mobile)
apps/desktop      Thin Electron shell; loads the local or LAN server URL
apps/mobile       Thin Capacitor iOS/Android shell; bundles the same web build
packages/*        Shared types, plugin API, storage/source plugins
```

Platform-specific code lives in the shells and `apps/web/src/platform/server.ts`.
Feature components should not branch on `process.platform`, `Platform.OS`, or
`navigator.platform`.

## Quick start (development)

```sh
pnpm install
pnpm dev
```

This starts the server on `:3001`, the web client on `:5173`, and Electron.
The desktop window loads `http://localhost:5173`; the Vite dev server proxies
`/api` to `:3001`.

To test on a phone during development, open `http://<your-lan-ip>:5173` from the
phone. Both servers bind to the LAN.

## Run for the LAN (recommended)

Build the web client and server once, then run the server on the machine that
holds the library (a PC, NAS, or Raspberry Pi):

```sh
pnpm --filter @mugiwara-manga/web build
pnpm --filter @mugiwara-manga/server build
PORT=3001 DATA_DIR=/path/to/mugiwara-data node apps/server/dist/index.js
```

The server prints its LAN addresses at startup:

```
🎉 Mugiwara server running on http://localhost:3001

📱 LAN access:
   - http://192.168.1.20:3001
```

Open that URL from any device on the same network. The web client and the API
are served from the same origin, so there is no CORS or port configuration in
the browser.

Notes:

- The server listens on `0.0.0.0` by default. Set `HOST=127.0.0.1` to restrict
  it to the local machine.
- Open the port in the host firewall (default `3001`).
- Every `/api` route except `/api/health` requires a paired device token. The
  server is safe to run on a trusted LAN, but still put it behind HTTPS and a
  reverse proxy if it is reachable from the internet.

## Authentication and pairing

The server uses a single-user bearer-token model. The raw token is shown once;
the database stores only its SHA-256 hash plus the device label, creation time,
last-used time and revocation state.

On first start, the server prints a short-lived pairing code:

```
🔑 First-run pairing code: ABCD2345
   Valid for 10 minutes. Enter it in the Mugiwara app to pair this device.
```

In the app, enter the server address and that code (or paste an access token)
on the Connect screen. Codes are single use and expire after 10 minutes. Once
paired, open **Settings → Security** to:

- see paired devices,
- revoke one device,
- create a pairing code for another device,
- rotate the current token (API: `POST /api/auth/rotate`),
- log out all devices (`POST /api/auth/logout-all`).

The web client stores the token per server origin in `localStorage` and sends
`Authorization: Bearer …` from the single API client. The server also sets an
`HttpOnly`, `SameSite=Lax` session cookie on pairing. That cookie lets
same-origin browser and Electron `<img>` tags load covers and reader pages.
Capacitor and other cross-origin clients request a short-lived (15 minute)
content-scoped signed token from `POST /api/auth/content-token`; the client
appends it as `?contentToken=…` to content URLs. It only works on
`/api/content/*` and is invalidated when the device token is revoked.

The packaged Electron app provisions a token automatically over loopback and
passes it to the renderer through the preload bridge, so desktop setup stays
zero-touch. Set `MUGIWARA_AUTH_TOKEN` to override that for a headless or shared
server. In development Electron reads the same env var or pairs through the
loopback server.

### Environment variables

| Variable                                           | Default                       | Purpose                                                                                                                         |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                             | `3001`                        | HTTP port.                                                                                                                      |
| `HOST`                                             | `0.0.0.0`                     | Bind address. Use `127.0.0.1` for local-only.                                                                                   |
| `DATA_DIR`                                         | `./data`                      | SQLite database, covers and plugin installs.                                                                                    |
| `WEB_DIR`                                          | auto-detect                   | Built web client directory.                                                                                                     |
| `MUGIWARA_ALLOWED_ORIGINS`                         | empty                         | Comma-separated extra CORS origins. Wildcards are ignored; same-origin and known Electron/Capacitor origins are always allowed. |
| `MUGIWARA_TRUST_PROXY`                             | `false`                       | Set to `true` when a reverse proxy terminates TLS (affects secure cookies and client IPs).                                      |
| `MUGIWARA_COOKIE_SECURE`                           | auto                          | Force the `Secure` cookie flag.                                                                                                 |
| `MUGIWARA_AUTH_TOKEN` / `MUGIWARA_BOOTSTRAP_TOKEN` | empty                         | Provision a fixed admin token (minimum 24 characters). The value is never logged.                                               |
| `MUGIWARA_BOOTSTRAP_LABEL`                         | `Bootstrap token`             | Device label for the bootstrap token.                                                                                           |
| `MUGIWARA_TOKEN_TTL_DAYS`                          | `0`                           | Optional bearer-token lifetime in days. `0` means tokens do not expire until revoked.                                           |
| `MUGIWARA_PLUGIN_REGISTRY`                         | `https://registry.npmjs.org/` | Approved npm registry. Must be HTTPS (HTTP is allowed only for localhost).                                                      |
| `MUGIWARA_PLUGIN_ALLOWLIST`                        | empty                         | Comma-separated exact package allowlist. Empty allows the `mugiwara-plugin-*` and `@mugiwara-manga/*` namespaces.               |
| `MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL`             | `false`                       | Permit plugin installs while bound to a non-loopback interface.                                                                 |
| `MUGIWARA_PLUGIN_INSTALL_ENABLED`                  | `true`                        | Master switch for plugin installation.                                                                                          |

### CORS, CSRF and body limits

CORS never uses `*`: only configured origins, the request's own origin, and the
known Electron/Vite (`http://localhost:5173`) and Capacitor
(`http://localhost`, `https://localhost`, `capacitor://localhost`) origins are
allowed, with `Access-Control-Allow-Credentials: true`. Disallowed preflights
are rejected with `403`.

State-changing requests that use cookie authentication must have a valid
`Origin` (or be same-origin/non-browser). `application/x-www-form-urlencoded`
writes are rejected with `415`; API writes use JSON. The global JSON body limit
is 1 MB, with a 20 MB limit for `/api/library/import`.

Auth and expensive routes (discovery, source search, metadata, storage scans,
plugin install/update) are rate limited. Auth failures, plugin
install/uninstall/update and destructive operations are written to the
`audit_logs` table; audit rows never contain tokens, pairing codes or request
bodies.

### Plugin installation safety

Plugin installation is admin-only and requires `confirm: true` in the request
body (the UI asks for confirmation). npm runs with `--ignore-scripts`, no audit
or funding checks, and the configured registry. Packages must match the approved
namespace or explicit allowlist and the `mugiwara-plugin-*` / `@mugiwara-manga/*`
name pattern. When the server is bound to a non-loopback interface, installs
and updates are disabled unless `MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL=true`.
Built-in source and storage plugins keep working and cannot be uninstalled.

## Library data, progress and reading status

The library is served by `GET /api/library/filter` (the legacy `GET /api/manga`
returns the same aggregates). For each manga:

- **Chapter count** is the number of distinct chapters, independent of how many
  progress rows exist.
- **Progress** is the most recent progress row across all devices, enriched with
  `percentComplete` and `isCompleted` (`isCompleted` is true at the last page or
  at >= 95% of the chapter). Raw database rows are not exposed to clients.
- **Reading status** is manga-level:
  - `reading`: the manga has progress rows, but not every chapter is completed.
  - `completed`: the manga has at least one chapter and every chapter has a
    completed latest progress row across devices.
  - `not-started`: the manga has no progress rows at all.

`GET /api/library/filters/options` counts distinct manga for each reading
status. `notStarted` is counted directly (not by subtracting other buckets), so
it cannot go negative.

Progress is stored per device as one row per
`(mangaId, chapterId, deviceId)`. The shared web client creates a random UUID
once, persists it in `localStorage` under `mugiwara.deviceId`, and sends it with
every progress write. Library cards and filters use the newest row across
devices. Older clients that omit a device id are stored under the `default`
device. A unique index plus `ON CONFLICT` upsert makes duplicate/double-submit
writes idempotent; the migration also deduplicates existing rows, keeping the
latest `lastReadAt` per key.

## Desktop

Development:

```sh
pnpm dev
```

Build installers:

```sh
pnpm build:desktop:mac
pnpm build:desktop:win
pnpm build:desktop:linux
```

By default the packaged desktop app starts its own server and provisions a
loopback auth token automatically for the renderer. To use a server that is
already running on the LAN instead:

```sh
MUGIWARA_SERVER_URL=http://192.168.1.20:3001 pnpm --filter @mugiwara-manga/desktop dev
# packaged binary:
MUGIWARA_SERVER_URL=http://192.168.1.20:3001 ./Mugiwara
```

The packaged desktop shell currently expects `node` on `PATH` to run the
embedded server. If you only use the LAN server, set `MUGIWARA_SERVER_URL` and
no embedded server is started. (Porting the `dev/osx-build` Electron-as-Node
packaging improvements is still on the list.)

## Mobile (Capacitor)

The mobile app in `apps/mobile` bundles the same web client and asks for the LAN
server address on first launch.

One-time setup:

```sh
pnpm install
pnpm --filter @mugiwara-manga/mobile add:android
pnpm --filter @mugiwara-manga/mobile add:ios
```

Every time the web UI changes:

```sh
pnpm cap:sync
# or one platform:
pnpm --filter @mugiwara-manga/mobile sync:android
pnpm --filter @mugiwara-manga/mobile sync:ios
```

### Build an installable Android APK

The easiest path is a debug APK. It is signed with the Android debug key and can
be installed directly on a phone:

```sh
pnpm build:app:android
```

Output:

```
dist/app/android/mugiwara-<version>-debug.apk
```

Install it over USB:

```sh
adb install -r dist/app/android/mugiwara-<version>-debug.apk
```

If a previous Mugiwara build signed with a different key is already installed
(for example the old React Native debug app), uninstall it first:

```sh
adb uninstall dev.zero.mugiwara
```

Or copy the APK to the phone and open it (enable "Install unknown apps" for the
file manager/browser you use).

For a release APK:

```sh
pnpm build:app:android:release
```

Unless you configure a keystore, the release APK is unsigned and cannot be
installed. Sign it with `apksigner` or use Android Studio's **Build → Generate
Signed Bundle/APK**:

```sh
$ANDROID_HOME/build-tools/36.0.0/apksigner sign \
  --ks mugiwara.keystore \
  --out dist/app/android/mugiwara-signed.apk \
  apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### Build/install on an iPhone

iOS builds require macOS + Xcode. From the repo:

```sh
pnpm --filter @mugiwara-manga/mobile sync:ios
pnpm --filter @mugiwara-manga/mobile open:ios
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities**.
2. Choose your Apple ID/team. A free Apple ID works for direct-to-device
   sideloading (the app expires after 7 days). A paid developer account is
   needed for TestFlight/App Store distribution.
3. Connect the iPhone, select it as the run destination, and press **Run**.
4. For TestFlight/App Store: **Product → Archive → Distribute App**.

You can also use `pnpm --filter @mugiwara-manga/mobile run:ios` to let Capacitor
pick a connected device/emulator.

On first launch, enter the server address printed by the server, for example
`http://192.168.1.20:3001`, then the one-time pairing code printed by the
server. The app verifies the address with `/api/health` before saving the
token for that server origin.

Cleartext HTTP is already configured for the LAN use case:

- Android: `allowMixedContent` in `capacitor.config.ts`, `cleartext: true`, and
  `android:usesCleartextTraffic="true"` in `AndroidManifest.xml`.
- iOS: `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking` and a local-network
  usage description in `Info.plist`.

See `apps/mobile/README.md` for details. If you later put the server behind
HTTPS, remove the cleartext exceptions.

## Tests

The server has focused security tests (auth, CORS/CSRF, content tokens and
plugin install hardening) using Vitest and Supertest:

```sh
pnpm --filter @mugiwara-manga/server test
```

The tests use a temporary `DATA_DIR` and an exported app factory, so they never
bind a port or touch your real library.

## Why no per-platform UI

- Desktop ships its own Chromium (Electron), so macOS/Windows/Linux render the
  same UI.
- Mobile uses the platform WebView (WKWebView on iOS, Chromium on Android). The
  shared UI is written with standard CSS and touch/pointer events; there is no
  separate mobile component tree.
- Window chrome, file dialogs, and server URLs are shell capabilities, exposed
  through one small adapter (`apps/web/src/platform/server.ts` and the Electron
  preload bridge).

The detailed investigation and migration plan are in
`tasks/platform-portability-strategy.md`.
