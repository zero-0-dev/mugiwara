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

Each desktop package must be built on its target operating system. The embedded
server ships native modules (`better-sqlite3`, `sharp`) compiled for the host,
so a Linux host cannot produce a working macOS or Windows package.

The build uses the architecture of the Node.js runtime that runs it: a native
arm64 Node on an Apple Silicon Mac produces an `arm64` package, and an Intel
Mac produces an `x64` package. On Apple Silicon, make sure the Node.js running
the build is a native arm64 build; a Node under Rosetta reports `x64` and
produces an Intel package.

The build downloads a pinned Node.js runtime (currently
`v24.22.3`, override with `MUGIWARA_NODE_VERSION`) from nodejs.org, verifies
its SHA-256 checksum and copies it into the app bundle. The embedded server and
the `npm` used by the plugin system both run on that runtime, so the desktop app
does not depend on `node` being installed on the user's machine.

The same build fetches the `better-sqlite3` prebuild for the bundled Node
version. That download normally needs no compiler; if upstream stops publishing
a matching prebuild, the build fails with an explicit error and you must upgrade
`better-sqlite3` or choose a Node.js version that has one.

By default the packaged desktop app starts its own server and provisions a
loopback auth token automatically for the renderer.

## Use an existing LAN server

To use a server that is already running on the LAN instead of the embedded one:

```sh
MUGIWARA_SERVER_URL=http://192.168.1.20:3001 pnpm --filter @mugiwara-manga/desktop dev
# packaged binary:
MUGIWARA_SERVER_URL=http://192.168.1.20:3001 ./Mugiwara
```

The packaged desktop shell runs the embedded server on the Node.js runtime
bundled in the app (`Resources/node`), so it does not need `node` on `PATH` and
plugin installs can use the bundled `npm`. If you only use a LAN server, set
`MUGIWARA_SERVER_URL` and no embedded server is started. Server output and
errors are written to `<userData>/data/server.log` (for example
`~/Library/Application Support/Mugiwara/data/server.log` on macOS).

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
