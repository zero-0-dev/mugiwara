# AGENTS.md

Guide for AI agents and contributors working on Mugiwara.

## What this project is

Mugiwara is a self-hosted manga reader. It has **one shared React UI** that runs
in a browser, inside an Electron desktop shell, and inside a Capacitor mobile
shell. A single Node server owns the library, files, plugins, download queue
and SQLite database.

The UI is never forked per platform. Platform differences live in the shells
and in small adapters, not in feature components.

## Repository layout

| Path                        | Package                      | Responsibility                                                                                       |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/server`               | `@mugiwara-manga/server`     | Express API, SQLite/Drizzle, auth, plugin manager, storage, download queue, static web host          |
| `apps/web`                  | `@mugiwara-manga/web`        | The only React UI: Vite, Tailwind v4, shadcn/Radix primitives, React Query                           |
| `apps/desktop`              | `@mugiwara-manga/desktop`    | Electron main/preload processes, embedded server lifecycle, desktop packaging                       |
| `apps/mobile`               | `@mugiwara-manga/mobile`     | Capacitor iOS/Android shell; bundles `apps/web/dist`                                                 |
| `packages/shared`           | `@mugiwara-manga/types`      | Shared TypeScript domain types                                                                       |
| `packages/plugin-api`       | `@mugiwara-manga/plugin-api` | Public interfaces for source and storage plugins                                                     |
| `packages/source-local`     | `@mugiwara-manga/source-local` | Built-in local-filesystem source plugin                                                            |
| `packages/storage-local`    | `@mugiwara-manga/storage-local` | Built-in local-filesystem storage backend                                                         |
| `packages/config`           | `@mugiwara-manga/tsconfig`   | Shared `tsconfig` bases. No runtime code, but it still declares a lint script                       |
| `packages/dmg-license-stub` | `dmg-license`                | Packaging shim used by electron-builder                                                              |
| `scripts`                   | —                            | Build/packaging helpers and the UI screenshot capture script                                         |

Generated or local-only paths that must not be edited by hand or committed:

- `dist/`, `build/`, `release/`, `.turbo/`
- `node_modules/`
- `data/`, `apps/server/data/`, `apps/server/deploy/`
- `apps/mobile/android/`, `apps/mobile/ios/` build output
- UI evidence screenshots

## Prerequisites

- Node.js >= 20.19 (required by ESLint 10; the repo is developed on current Node releases)
- pnpm >= 11 (the lockfile is `pnpm-lock.yaml`; do not use npm/yarn)
- For Android builds: Android SDK and `ANDROID_HOME`
- For iOS builds: macOS + Xcode
- For desktop installers: the platform toolchain required by electron-builder

## Setup and everyday commands

```sh
pnpm install
pnpm dev                     # server :3001 + web :5173 + Electron
pnpm --filter @mugiwara-manga/server dev
pnpm --filter @mugiwara-manga/web dev
```

The Vite dev server proxies `/api` to `http://localhost:3001`. `pnpm dev`
excludes the mobile shell; mobile uses the same web build through Capacitor.

Useful component commands:

```sh
pnpm --filter @mugiwara-manga/server test
pnpm --filter @mugiwara-manga/web test
pnpm --filter @mugiwara-manga/mobile sync:android
pnpm --filter @mugiwara-manga/mobile sync:ios
pnpm build:app:android
pnpm build:desktop:linux
pnpm build:desktop:win
pnpm build:desktop:mac
```

## Architecture notes

### Server (`apps/server`)

- `src/index.ts` boots the process: database, auth service, built-in plugins,
  storage manager, plugin manager, install/discovery services, queue processor,
  HTTP listener, LAN URL logging.
- `src/app.ts` creates the Express app, applies CORS/CSRF/body limits, mounts
  routers, serves the web build, and is exported so tests can run without
  binding a port.
- `src/api/*` contains route modules (`library`, `chapters`, `content`,
  `metadata`, `storage`, `plugins`, `queue`, `discover`, …).
- `src/auth/*` implements bearer tokens, pairing codes, hashed storage,
  cookies, middleware and content-scoped tokens.
- `src/database/*` contains Drizzle setup, schema and repositories.
  Migrations live in `apps/server/drizzle`.
- `src/queue/*` is the background import/download queue.
- `src/plugins/*` loads built-in and installed plugins; installed plugins are
  admin-only, registry/allowlist-checked and run with `--ignore-scripts`.
- `src/security/*` contains CORS/CSRF/origin helpers and rate limiting.
- Shared services are injected through globals declared in `src/index.ts`.
- Tests live in `test/` and under `src/**/__tests__/`. They use a temporary
  `DATA_DIR`, an exported app factory and Vitest/Supertest, and must not bind
  the real server port or touch the real library.

### Web (`apps/web`)

- `src/App.tsx` owns app bootstrap (server resolution, theme, providers) and
  mounts the router. Screens are URL-driven: `/`, `/manga/:mangaId`,
  `/read/:mangaId/:chapterId`, `/discover`, `/discover/:anilistId`,
  `/settings/:tab?` and `/disk-space`. Do not add an in-memory view union or a
  second navigation model; use `react-router-dom` (`useNavigate`,
  `useSearchParams`, `useParams`). Library filters/search/sort belong in query
  params, transient UI state stays local.
- `src/routing/*` holds the route table (`routes.tsx`), the application frame
  (`AppShell.tsx`), scroll restoration and navigation helpers. Add new screens
  as routes, not as new `currentView` branches.
- `src/platform/backButton.ts` and `src/platform/deepLinks.ts` own the
  Capacitor wiring (`@capacitor/app`): Android back maps to web history (second
  press at the root exits), and app links resolve to routes. Feature
  components must not import Capacitor App directly.
- `src/api/client.ts` is the single API client. It stores the server URL and
  bearer token per origin and sends auth headers. Do not add ad-hoc `fetch`
  calls in components.
- `src/api/hooks.ts` holds React Query hooks; server state should flow through
  React Query rather than local caches.
- `src/platform/*` is the only place for runtime platform differences
  (`server.ts`, `haptics.ts`, `localImport.ts`, `systemBars.ts`). Feature
  components must not branch on `process.platform`, `Platform.OS` or
  `navigator.platform`.
- `src/components/ui/*` contains shadcn/Radix primitives. Reuse them and the
  `cn()` helper before inventing bespoke styling.
- `src/index.css` is limited to tokens, base styles and the reader layout.
  Screens use Tailwind utilities.
- Tests live in `test/` (jsdom + Testing Library) and next to pure helpers
  (`*.test.ts`).

### Desktop (`apps/desktop`)

- `src/main/*` is the Electron main process, including the embedded
  `ServerManager`, loopback token provisioning and IPC. It registers the
  `mugiwara://` protocol and forwards deep links to the shared router.
- `src/preload/*` exposes the narrow bridge consumed by the web UI.
- The renderer is always the shared web build. Do not add a desktop-only UI.

### Mobile (`apps/mobile`)

- `capacitor.config.ts` points `webDir` at `../web/dist` and configures the
  HTTP/LAN behavior required by the server.
- `pnpm cap:sync` (or the per-platform sync scripts) rebuilds the web app and
  copies it into the native projects.
- The UI is the same shared web build. Do not add a mobile-only component tree.

### Shared packages

- `@mugiwara-manga/types` is the shared domain vocabulary. Change it in one
  place and update consumers.
- `packages/plugin-api` is a published contract. Treat interface changes as
  breaking API changes and document them.
- `source-local` and `storage-local` are built-in plugins and must keep working
  after plugin-manager changes.

## Conventions

- TypeScript is strict. Keep types explicit at API and plugin boundaries.
- Use the `@/` alias inside `apps/web`.
- Follow the existing double-quote, semicolon and trailing-comma style.
- Avoid `any` unless the surrounding boundary already uses it; prefer narrow
  types. Lint does not currently block explicit `any`, but reviews do.
- Keep routes authenticated. Only `/api/health` and the pairing/auth flow are
  exempt. Never bypass auth middleware for convenience.
- Never log tokens, pairing codes or request bodies that may contain secrets.
- Validate user-controlled paths and plugin package names before touching the
  filesystem.
- Preserve backward compatibility of API responses unless the task explicitly
  changes the contract.
- Update `README.md`, this file or the relevant package README when behavior or
  commands change.
- Do not commit generated artifacts, databases, screenshots or local data.

## Gating checks

These are the checks that must pass before a change is considered mergeable.
Run them from the repository root. `pnpm verify` runs the full sequence in the
same order.

| Gate      | Command                            | What it covers                                                                                              |
| --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Install   | `pnpm install --frozen-lockfile`   | Lockfile is in sync with `package.json` files; no stale or missing dependency entries                       |
| Typecheck | `pnpm typecheck`                   | `tsc --noEmit` in desktop, web, server, plugin-api, source-local and storage-local                          |
| Lint      | `pnpm lint`                        | ESLint across every component that has source, plus root `scripts/` and config files                         |
| Test      | `pnpm test`                        | Vitest in web (jsdom/Testing Library) and server (Vitest/Supertest); other packages have no tests today      |
| Build     | `pnpm build`                       | Turbo build of web, server, desktop and the shared packages                                                 |

```sh
pnpm install --frozen-lockfile
pnpm verify            # typecheck -> lint -> test -> build
```

The repository currently has no CI workflow; the author/agent runs these gates
and reports the results in the PR. If CI is added, it must run the same
commands so local and remote gating stay identical.

Packaging commands (`build:app:android`, `build:desktop:*`, `build:server:deploy`)
are **not** part of `pnpm verify` because they need extra SDKs/toolchains. Run
the packaging command relevant to the change when you touch packaging, mobile
native config or Electron release code.

### Lint (new gate)

Lint is configured once at the root in `eslint.config.mjs` (ESLint 10 flat
config with `typescript-eslint`). Turbo runs the `lint` script in each
component; each package resolves the root config upward, so there is one set of
rules.

Rules currently enforced:

- `@eslint/js` recommended
- `typescript-eslint` recommended (including unused variables; unused
  variables/arguments prefixed with `_` are allowed)
- `react-hooks/rules-of-hooks` as an error
- `react-hooks/exhaustive-deps` as a warning (address it; do not suppress it
  unless the dependency is intentionally omitted)
- `no-console` is allowed because the server logs startup and operational
  information

Escape hatches:

```sh
pnpm exec eslint apps/web/src/components/Reader.tsx
pnpm exec eslint --fix apps/web/src
```

If you add a new package with `.ts`/`.tsx`/`.js` source, add a `lint` script to
its `package.json` (for example `"lint": "eslint src"`) so `turbo lint` covers
it. `packages/config` has no runtime code and uses
`eslint --no-error-on-unmatched-pattern .` so it still has a `lint` task and
will pick up code if any is added.

### Tests

- Server tests must stay hermetic: temporary `DATA_DIR`, no real port, no real
  library writes.
- Web component tests use jsdom and Testing Library; pure logic tests sit next
  to the helper they cover.
- Add or update tests for auth, CORS/CSRF, content tokens, plugin install
  hardening, path handling and download/queue behavior. Security-sensitive
  changes without tests are not mergeable.

### Build

- `pnpm build` is the compile/build gate. It must not rely on a running server.
- The web build is bundled into desktop and mobile; verify it still builds after
  UI dependency changes.
- Do not commit `dist/` output from a local build.

## Evidence gathering for pull requests (mandatory)

Every agent that opens a pull request **must include evidence of the change**.
A PR without evidence is not ready for review.

Text evidence belongs in the PR description or in PR comments. **Screenshots
and recordings must be attached as PR comments and never committed to git.**
Capture them outside the repository (the screenshot script defaults to
`/tmp/mugiwara-ui`), then attach them to a PR comment with the GitHub web UI
(drag and drop) or your normal upload tool. For text-only evidence you can also
use:

```sh
gh pr comment <number> --body-file /tmp/evidence.md
```

### 1. Always include gate evidence

Paste the exact commands you ran and their outcome. A compact block is enough:

```text
## Gates

- pnpm install --frozen-lockfile: pass
- pnpm typecheck: pass (6 packages)
- pnpm lint: pass (10 packages + root scripts)
- pnpm test: pass (web + server, 59 server tests, 0 failures)
- pnpm build: pass
```

If a gate could not run (for example no Android SDK), say so explicitly and
explain why.

### 2. Include change evidence

Choose what proves the change works:

- **API/backend**: a request and response (redact tokens), a failing test
  before and passing test after, migration before/after, or a short server log.
- **Bug fix**: the reproduction steps and the behavior after the fix.
- **Package/plugin**: the command that exercises the package and its output.
- **Performance**: before/after numbers and how they were measured.
- **Docs/config**: the relevant diff or the command whose output changed.

Keep evidence reproducible: include the branch/commit or the exact commands.

### 3. UI changes require screenshots

Any change that affects what the user sees needs visual evidence. Capture both
breakpoints and both themes when the change touches shared styling:

| Viewport | Size        | Themes        |
| -------- | ----------- | ------------- |
| Desktop  | 1280 x 860  | light + dark  |
| Mobile   | 390 x 844   | light + dark  |

The repo provides a Playwright helper that captures the main screens (library,
manga detail, reader, settings tabs, discover, add-manga, server setup):

```sh
MUGIWARA_UI_URL=http://127.0.0.1:3001 \
MUGIWARA_UI_TOKEN=<paired-device-token> \
MUGIWARA_UI_OUT=/tmp/mugiwara-ui \
pnpm screens
```

Notes:

- The server must be running with a library containing at least one manga.
- `MUGIWARA_UI_TOKEN` is a paired device token. If the server was started with
  `MUGIWARA_AUTH_TOKEN`, use that value. Never commit or paste the token into a
  PR comment or screenshot.
- `MUGIWARA_UI_SOURCE_PATH` optionally adds local-import search results to the
  add-manga captures.
- `MUGIWARA_UI_OUT` must point outside the repository. Leave it at the default
  `/tmp/mugiwara-ui` if unsure.
- Re-capture after the final UI commit; stale screenshots are not evidence.

Attach the screenshots as a PR comment, for example:

```text
## UI evidence

Desktop (light/dark): library, manga detail, reader, settings
Mobile (light/dark): library, manga detail, reader, settings
```

Then drag the PNGs into the comment in the GitHub UI and submit. Use a separate
comment from the PR description when there are many images. Screen recordings
(GIF/MP4) are welcome for interactions, but are not a substitute for still
screenshots of the changed states.

Before finishing:

```sh
git status --short   # must not list screenshots or other capture files
```

### 4. Keep secrets out of evidence

Redact bearer tokens, pairing codes, cookies, API keys, absolute personal
paths, and any real library titles you would not share publicly. Prefer a
throwaway `DATA_DIR` and test content for captures.

### PR evidence template

```markdown
## Summary

<what changed and why>

## Gates

- [ ] pnpm install --frozen-lockfile
- [ ] pnpm typecheck
- [ ] pnpm lint
- [ ] pnpm test
- [ ] pnpm build

## Evidence

<commands, output, API examples, before/after>

## UI evidence (delete if not UI)

Screenshots attached as PR comments (desktop/mobile, light/dark).
```

## Pull request workflow

1. Branch from `main` using a descriptive name (`feat/…`, `fix/…`, `chore/…`).
2. Make the smallest coherent change; keep unrelated refactors out of the PR.
3. Update tests, docs and types with the code.
4. Run `pnpm verify`. Fix failures rather than skipping gates.
5. Run the extra packaging command if you touched native/packaging code.
6. Capture evidence, including screenshots for UI work.
7. Open the PR with the evidence template. Do not commit screenshots, tokens,
   build output or `data/`.
8. Address review findings and re-run the gates, then refresh any UI evidence
   that is now stale.

## Common tasks

### Add an API route

1. Add the route module or handler in `apps/server/src/api/`.
2. Mount it in `apps/server/src/app.ts` and keep it behind auth.
3. Use existing repositories/services; do not query SQLite directly from a
   route if a repository exists.
4. Add a Supertest case in `apps/server/test/` using the exported app factory.
5. Run `pnpm --filter @mugiwara-manga/server test` and the full gates.

### Change the database schema

1. Update `apps/server/src/database/schema/` and repositories.
2. Generate and commit the migration with
   `pnpm --filter @mugiwara-manga/server db:generate`.
3. Verify migrations against a fresh temporary `DATA_DIR`.
4. Add repository/API tests for the new behavior.

### Add or change a UI screen

1. Use `src/components/ui` primitives and Tailwind utilities.
2. Fetch through `src/api/hooks.ts` / the shared API client.
3. Keep platform-specific behavior in `src/platform/*`.
4. Add a jsdom test for logic or component behavior where practical.
5. Capture desktop and mobile screenshots in both themes for the PR.

### Add a package

1. Add `build`, `typecheck`, `lint` and (if applicable) `test` scripts.
2. Extend the shared tsconfig from `packages/config` where possible.
3. Add a `lint` script so `turbo lint` includes the package.
4. Document the package in this file and the README if it is user-facing.

## Troubleshooting

- **`pnpm lint` fails with "command not found"**: run `pnpm install` first;
  ESLint and `typescript-eslint` are root dev dependencies.
- **Lint passes locally but fails in a package**: run
  `pnpm --filter <package> lint` to reproduce with that package's working
  directory.
- **Screenshot capture fails**: check that the server is on `MUGIWARA_UI_URL`,
  the token is valid and the library is non-empty. The script waits for the
  "Library" heading and real manga cards. If Chromium is missing, run
  `pnpm exec playwright install chromium`.
- **Android build fails**: ensure `ANDROID_HOME`/`ANDROID_SDK_ROOT` is set and
  the SDK/build-tools are installed; run `cap:sync` before Gradle.
- **Desktop packaging fails**: run the web and server builds first, and verify
  the electron-builder inputs (`apps/server/dist`, `apps/server/deploy`,
  `apps/web/dist`) exist.
- **Database looks wrong**: use a fresh temporary `DATA_DIR` instead of deleting
  a real library. Migrations run on server start.
