# Mugiwara mobile shell (Capacitor)

`apps/mobile` packages the shared web client (`apps/web`) for iOS and Android.
There is no second UI. The app bundles the web build locally and connects to a
Mugiwara server on your LAN.

On first launch it asks for the server address printed by the server, for
example:

```
http://192.168.1.20:3001
```

Then enter the one-time pairing code printed on the server console. The app
stores the resulting bearer token per server origin and sends it with every API
request. Reader pages and covers are loaded by `<img>` tags, so the client also
requests a short-lived content-scoped token and appends it to `/api/content`
URLs; that is what keeps images working across the Capacitor WebView origin.

## Requirements

- Node 22+ (the repo is on Node 26)
- Android: Android Studio / Android SDK, `ANDROID_HOME` set
- iOS: macOS + Xcode 26+ (Capacitor 8)

## One-time setup

```sh
pnpm install
pnpm --filter @mugiwara-manga/mobile add:android
pnpm --filter @mugiwara-manga/mobile add:ios
```

The native projects are generated in `android/` and `ios/`.

## Sync the web UI

Every time `apps/web` changes:

```sh
pnpm cap:sync
# or:
pnpm --filter @mugiwara-manga/mobile sync:android
pnpm --filter @mugiwara-manga/mobile sync:ios
```

`sync` builds `apps/web` and copies its `dist` into the native projects.

## Reader plugins

The shared web reader uses two Capacitor plugins:

- `SystemBars` is bundled with `@capacitor/core` (Capacitor 8+), so hiding the
  status/navigation bars in immersive reading needs no extra sync.
- `@capacitor/haptics` is a separate native plugin. It is listed in
  `apps/mobile/package.json`; run `pnpm cap:sync` (or the normal
  `build:app:*` scripts) after changing it so the native implementation is
  installed. On the web the plugin is a no-op and page turns stay silent.

## Android: build and install

### Debug APK (easiest)

```sh
pnpm build:app:android
```

The APK is written to:

```
dist/app/android/mugiwara-<version>-debug.apk
```

Install over USB:

```sh
adb install -r dist/app/android/mugiwara-<version>-debug.apk
```

If an older Mugiwara build signed with a different key is installed (for example
the old React Native debug app), remove it first:

```sh
adb uninstall dev.zero.mugiwara
```

Or copy the APK to the phone and open it. You may need to allow "Install unknown
apps" for the app you use to open it.

This APK is signed with the Android debug key, so it installs without a signing
setup.

### Release APK

```sh
pnpm build:app:android:release
```

Without a configured keystore this produces `app-release-unsigned.apk`, which
cannot be installed. Sign it with `apksigner`:

```sh
keytool -genkey -v -keystore mugiwara.keystore \
  -alias mugiwara -keyalg RSA -keysize 2048 -validity 10000

$ANDROID_HOME/build-tools/36.0.0/apksigner sign \
  --ks mugiwara.keystore \
  --out dist/app/android/mugiwara-signed.apk \
  apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk
```

Or use Android Studio: **Build → Generate Signed Bundle/APK**.

### From Android Studio

```sh
pnpm --filter @mugiwara-manga/mobile sync:android
pnpm --filter @mugiwara-manga/mobile open:android
```

Then Run (debug) or Build → Generate Signed Bundle/APK (release).

## iOS: build and install

iOS builds require macOS and Xcode.

```sh
pnpm --filter @mugiwara-manga/mobile sync:ios
pnpm --filter @mugiwara-manga/mobile open:ios
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities**.
2. Pick your Apple ID/team. A free Apple ID can sideload to a connected iPhone
   (the build expires after 7 days). TestFlight/App Store needs a paid Apple
   Developer account.
3. Select the iPhone as the run destination and press **Run**.
4. For distribution: **Product → Archive → Distribute App**.

Alternative: let Capacitor pick a connected device:

```sh
pnpm --filter @mugiwara-manga/mobile run:ios
```

## Cleartext HTTP on the LAN

The web client runs from `capacitor://localhost` on iOS and
`http://localhost` on Android, so calling a plain `http://` LAN server is
cross-origin (and would be mixed content if Android were still on `https`).

- **Android:** `server.androidScheme` is `http` (not `https`) and
  `server.cleartext` is enabled in `capacitor.config.ts`, and
  `AndroidManifest.xml` has `android:usesCleartextTraffic="true"`. Serving the
  bundled UI from `https://localhost` makes the WebView treat LAN images as
  mixed content and silently refuse to load them, even with
  `android.allowMixedContent`; using `http://localhost` avoids that.
- **iOS:** `ios/App/App/Info.plist` has ATS exceptions
  (`NSAllowsArbitraryLoads`, `NSAllowsArbitraryLoadsInWebContent` and
  `NSAllowsLocalNetworking`) and a local-network usage description.

These are appropriate for a self-hosted LAN app. If you put the server behind
HTTPS, remove them.

## Why not set `server.url` to the LAN address?

`server.url` makes the app a remote-code wrapper and requires rebuilding when
the LAN address changes. Bundling the web client and asking for the server
address at runtime keeps the app usable when the server moves.
