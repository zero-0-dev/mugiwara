# Getting started

## Prerequisites

- Node.js >= 22.12 (required by ESLint 10 and Electron 42; the repo is
  developed on current Node releases).
- pnpm >= 11. The lockfile is `pnpm-lock.yaml`; do not use npm or yarn.
- For Android builds: the Android SDK and `ANDROID_HOME`.
- For iOS builds: macOS and Xcode.
- For desktop installers: build each package on its target OS (macOS packages
  on macOS, Windows packages on Windows, Linux packages on Linux). The embedded
  server ships native modules for the host platform.

## Install and run in development

```sh
pnpm install
pnpm dev
```

This starts the server on `:3001`, the web client on `:5173`, and Electron. The
desktop window loads `http://localhost:5173`; the Vite dev server proxies `/api`
to `:3001`.

The mobile shell is excluded from `pnpm dev`. It uses the same web build through
Capacitor; see [Mobile](mobile.md).

Useful component commands:

```sh
pnpm --filter @mugiwara-manga/server dev
pnpm --filter @mugiwara-manga/web dev
pnpm --filter @mugiwara-manga/server test
pnpm --filter @mugiwara-manga/web test
pnpm --filter @mugiwara-manga/mobile sync:android
pnpm --filter @mugiwara-manga/mobile sync:ios
```

To test on a phone during development, open `http://<your-lan-ip>:5173` from the
phone. Both servers bind to the LAN.

## Run for the LAN (recommended)

Build the web client and server once, then run the server on the machine that
holds the library (a PC, NAS or Raspberry Pi):

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
  reverse proxy if it is reachable from the internet. See
  [Authentication and security](authentication.md).

## First launch

On first start the server prints a short-lived pairing code. Enter the server
address and that code on the app's Connect screen. Packaged desktop builds pair
automatically over loopback, so desktop setup is zero-touch.

For the full token model, device management and content-token behavior, see
[Authentication and security](authentication.md).
