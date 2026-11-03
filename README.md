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
- There is no authentication yet. Treat it as a trusted-LAN service and do not
  expose it to the internet without a reverse proxy and auth.

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

By default the packaged desktop app starts its own server. To use a server that
is already running on the LAN instead:

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
`http://192.168.1.20:3001`. The app verifies it with `/api/health` before
saving.

Cleartext HTTP is already configured for the LAN use case:

- Android: `allowMixedContent` in `capacitor.config.ts`, `cleartext: true`, and
  `android:usesCleartextTraffic="true"` in `AndroidManifest.xml`.
- iOS: `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking` and a local-network
  usage description in `Info.plist`.

See `apps/mobile/README.md` for details. If you later put the server behind
HTTPS, remove the cleartext exceptions.

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
