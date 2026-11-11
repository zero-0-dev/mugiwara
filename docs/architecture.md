# Architecture

Mugiwara is a monorepo with one UI and one server. Platform differences live in
the shells and in small adapters, never in feature components.

## Repository layout

| Path                        | Package                         | Responsibility                                                                              |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/server`               | `@mugiwara-manga/server`        | Express API, SQLite/Drizzle, auth, plugin manager, storage, download queue, static web host |
| `apps/web`                  | `@mugiwara-manga/web`           | The only React UI: Vite, Tailwind v4, shadcn/Radix primitives, React Query                  |
| `apps/desktop`              | `@mugiwara-manga/desktop`       | Electron main/preload processes, embedded server lifecycle, desktop packaging               |
| `apps/mobile`               | `@mugiwara-manga/mobile`        | Capacitor iOS/Android shell; bundles `apps/web/dist`                                        |
| `packages/shared`           | `@mugiwara-manga/types`         | Shared TypeScript domain types                                                              |
| `packages/plugin-api`       | `@mugiwara-manga/plugin-api`    | Public interfaces for source and storage plugins                                            |
| `packages/source-local`     | `@mugiwara-manga/source-local`  | Built-in local-filesystem source plugin                                                     |
| `packages/storage-local`    | `@mugiwara-manga/storage-local` | Built-in local-filesystem storage backend                                                   |
| `packages/config`           | `@mugiwara-manga/tsconfig`      | Shared `tsconfig` bases; no runtime code                                                    |
| `packages/dmg-license-stub` | `dmg-license`                   | Packaging shim used by electron-builder                                                     |
| `scripts`                   | —                               | Build/packaging helpers and the UI screenshot capture script                                |

Generated or local-only paths that must not be edited by hand or committed:

- `dist/`, `build/`, `release/`, `.turbo/`
- `node_modules/`
- `data/`, `apps/server/data/`, `apps/server/deploy/`
- `apps/mobile/android/`, `apps/mobile/ios/` build output
- UI evidence screenshots

## Process map

```
apps/server       Express API + SQLite + plugins + queue; also serves the web build
apps/web          The single React UI (also used by desktop and mobile)
apps/desktop      Thin Electron shell; loads the local or LAN server URL
apps/mobile       Thin Capacitor iOS/Android shell; bundles the same web build
packages/*        Shared types, plugin API, storage/source plugins
```

Platform-specific code lives in the shells and in
`apps/web/src/platform/server.ts`. Feature components must not branch on
`process.platform`, `Platform.OS` or `navigator.platform`.

### Server

- `src/index.ts` boots the process: database, auth service, built-in plugins,
  storage manager, plugin manager, install/discovery services, queue processor,
  HTTP listener and LAN URL logging.
- `src/app.ts` creates the Express app, applies CORS/CSRF/body limits, mounts
  routers, serves the web build, and is exported so tests can run without
  binding a port.
- `src/api/*` contains route modules (`library`, `chapters`, `content`,
  `metadata`, `storage`, `plugins`, `queue`, `discover`, …).
- `src/auth/*` implements bearer tokens, pairing codes, hashed storage,
  cookies, middleware and content-scoped tokens.
- `src/database/*` contains Drizzle setup, schema and repositories. Migrations
  live in `apps/server/drizzle`.
- `src/queue/*` is the background import/download queue.
- `src/plugins/*` loads built-in and installed plugins. Installed plugins are
  admin-only, registry/allowlist-checked and run with `--ignore-scripts`.
- `src/security/*` contains CORS/CSRF/origin helpers and rate limiting.

Shared services are injected through globals declared in `src/index.ts`.

### Web

- `src/App.tsx` owns app bootstrap (server resolution, theme, providers) and
  mounts the router.
- `src/routing/*` holds the route table, the application frame, scroll
  restoration and navigation helpers.
- `src/platform/*` is the only place for runtime platform differences
  (`server.ts`, `haptics.ts`, `localImport.ts`, `systemBars.ts`,
  `backButton.ts`, `deepLinks.ts`).
- `src/api/client.ts` is the single API client; `src/api/hooks.ts` holds the
  React Query hooks. Server state flows through React Query.
- `src/components/ui/*` contains shadcn/Radix primitives.

### Desktop

`src/main/*` is the Electron main process, including the embedded
`ServerManager`, loopback token provisioning and IPC. It registers the
`mugiwara://` protocol and forwards deep links to the shared router.
`src/preload/*` exposes the narrow bridge consumed by the web UI. The renderer
is always the shared web build.

### Mobile

`capacitor.config.ts` points `webDir` at `../web/dist` and configures the
HTTP/LAN behavior required by the server. The UI is the same shared web build;
there is no mobile-only component tree.

## Why there is no per-platform UI

- Desktop ships its own Chromium (Electron), so macOS/Windows/Linux render the
  same UI.
- Mobile uses the platform WebView (WKWebView on iOS, Chromium on Android). The
  shared UI uses standard CSS and touch/pointer events.
- Window chrome, file dialogs and server URLs are shell capabilities exposed
  through one small adapter (`apps/web/src/platform/server.ts` and the Electron
  preload bridge).

The detailed investigation and migration plan live in
[`tasks/platform-portability-strategy.md`](../tasks/platform-portability-strategy.md).

## Shared packages

- `@mugiwara-manga/types` is the shared domain vocabulary. Change it in one
  place and update consumers.
- `packages/plugin-api` is a published contract. Treat interface changes as
  breaking API changes and document them.
- `source-local` and `storage-local` are built-in plugins and must keep working
  after plugin-manager changes.
