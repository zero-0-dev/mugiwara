# Mobile (Capacitor)

The mobile app in `apps/mobile` bundles the same web client and asks for the LAN
server address on first launch.

## One-time setup

```sh
pnpm install
pnpm --filter @mugiwara-manga/mobile add:android
pnpm --filter @mugiwara-manga/mobile add:ios
```

## Sync the web UI

Every time the web UI changes:

```sh
pnpm cap:sync
# or one platform:
pnpm --filter @mugiwara-manga/mobile sync:android
pnpm --filter @mugiwara-manga/mobile sync:ios
```

## Build an installable Android APK

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

## Build/install on an iPhone

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

## First launch

Enter the server address printed by the server, for example
`http://192.168.1.20:3001`, then the one-time pairing code printed by the server.
The app verifies the address with `/api/health` before saving the token for that
server origin.

## Cleartext HTTP

Cleartext HTTP is already configured for the LAN use case:

- Android: `allowMixedContent` in `capacitor.config.ts`, `cleartext: true`, and
  `android:usesCleartextTraffic="true"` in `AndroidManifest.xml`.
- iOS: `NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking` and a local-network
  usage description in `Info.plist`.

See `apps/mobile/README.md` for details. If you later put the server behind
HTTPS, remove the cleartext exceptions.
