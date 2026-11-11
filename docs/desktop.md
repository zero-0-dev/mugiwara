# Desktop (Electron)

The desktop app in `apps/desktop` is a thin Electron shell. It loads the shared
web build; it does not fork the UI.

## Development

```sh
pnpm dev
```

This starts the server on `:3001`, the Vite dev server on `:5173`, and the
Electron window. The window loads `http://localhost:5173`.

## Build installers

```sh
pnpm build:desktop:mac
pnpm build:desktop:win
pnpm build:desktop:linux
```

By default the packaged desktop app starts its own server and provisions a
loopback auth token automatically for the renderer.

## Use an existing LAN server

To use a server that is already running on the LAN instead of the embedded one:

```sh
MUGIWARA_SERVER_URL=http://192.168.1.20:3001 pnpm --filter @mugiwara-manga/desktop dev
# packaged binary:
MUGIWARA_SERVER_URL=http://192.168.1.20:3001 ./Mugiwara
```

The packaged desktop shell currently expects `node` on `PATH` to run the
embedded server. If you only use the LAN server, set `MUGIWARA_SERVER_URL` and
no embedded server is started. Porting the `dev/osx-build` Electron-as-Node
packaging improvements is still on the list.

## How it works

- `src/main/*` owns the Electron main process, the embedded `ServerManager`,
  loopback token provisioning, IPC and the `mugiwara://` protocol.
- `src/preload/*` exposes the narrow bridge consumed by the web UI
  (`getServerPort`, `getApiUrl`, `getAuthToken`, `getAppVersion`,
  `selectFolder`, `openFolder`, `platform`).
- The renderer is always the shared web build from `apps/web/dist`.
- The main process provisions a token through loopback pairing (or
  `MUGIWARA_AUTH_TOKEN`) and hands it to the renderer through the preload
  bridge. The token is never written to logs.

See [Architecture](architecture.md) for the repository boundaries and
[Development](development.md) for the gating checks.
