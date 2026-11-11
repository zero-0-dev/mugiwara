# Development

## Setup

```sh
pnpm install
pnpm dev
```

See [Getting started](getting-started.md) for prerequisites and LAN deployment.

## Gating checks

These are the checks that must pass before a change is considered mergeable.
Run them from the repository root. `pnpm verify` runs the full sequence in the
same order.

| Gate      | Command                          | What it covers                                                                     |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Install   | `pnpm install --frozen-lockfile` | Lockfile is in sync with `package.json` files                                      |
| Typecheck | `pnpm typecheck`                 | `tsc --noEmit` in desktop, web, server, plugin-api, source-local and storage-local |
| Lint      | `pnpm lint`                      | ESLint across every component with source, plus root `scripts/` and config files   |
| Test      | `pnpm test`                      | Vitest in web (jsdom/Testing Library) and server (Vitest/Supertest)                |
| Build     | `pnpm build`                     | Turbo build of web, server, desktop and the shared packages                        |

```sh
pnpm install --frozen-lockfile
pnpm verify            # typecheck -> lint -> test -> build
```

Packaging commands (`build:app:android`, `build:desktop:*`,
`build:server:deploy`) are **not** part of `pnpm verify` because they need extra
SDKs/toolchains. Run the packaging command relevant to the change when you touch
packaging, mobile native config or Electron release code.

## Lint

Lint is configured once at the root in `eslint.config.mjs` (ESLint 10 flat
config with `typescript-eslint`). Turbo runs the `lint` script in each
component; each package resolves the root config upward, so there is one set of
rules.

Rules currently enforced:

- `@eslint/js` recommended.
- `typescript-eslint` recommended (including unused variables; unused
  variables/arguments prefixed with `_` are allowed).
- `react-hooks/rules-of-hooks` as an error.
- `react-hooks/exhaustive-deps` as a warning (address it; do not suppress it
  unless the dependency is intentionally omitted).
- `no-console` is allowed because the server logs startup and operational
  information.

Escape hatches:

```sh
pnpm exec eslint apps/web/src/components/Reader.tsx
pnpm exec eslint --fix apps/web/src
```

If you add a new package with `.ts`/`.tsx`/`.js` source, add a `lint` script to
its `package.json` (for example `"lint": "eslint src"`) so `turbo lint` covers
it.

## Tests

- Server tests must stay hermetic: temporary `DATA_DIR`, no real port, no real
  library writes.
- Web component tests use jsdom and Testing Library; pure logic tests sit next
  to the helper they cover.
- Add or update tests for auth, CORS/CSRF, content tokens, plugin install
  hardening, path handling and download/queue behavior. Security-sensitive
  changes without tests are not mergeable.

```sh
pnpm --filter @mugiwara-manga/server test
pnpm --filter @mugiwara-manga/web test
```

The server tests use a temporary `DATA_DIR` and an exported app factory, so they
never bind a port or touch your real library.

## Build

- `pnpm build` is the compile/build gate. It must not rely on a running server.
- The web build is bundled into desktop and mobile; verify it still builds after
  UI dependency changes.
- Do not commit `dist/` output from a local build.

## Conventions

- TypeScript is strict. Keep types explicit at API and plugin boundaries.
- Use the `@/` alias inside `apps/web`.
- Follow the existing double-quote, semicolon and trailing-comma style.
- Avoid `any` unless the surrounding boundary already uses it; prefer narrow
  types.
- Keep routes authenticated. Only `/api/health` and the pairing/auth flow are
  exempt.
- Never log tokens, pairing codes or request bodies that may contain secrets.
- Validate user-controlled paths and plugin package names before touching the
  filesystem.
- Preserve backward compatibility of API responses unless the task explicitly
  changes the contract.
- Update `README.md`, `AGENTS.md` or the relevant package README when behavior
  or commands change.
- Do not commit generated artifacts, databases, screenshots or local data.

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
4. Document the package in `AGENTS.md` and the README if it is user-facing.

## UI evidence

UI changes need screenshots in both themes at desktop and mobile sizes:

| Viewport | Size       | Themes       |
| -------- | ---------- | ------------ |
| Desktop  | 1280 x 860 | light + dark |
| Mobile   | 390 x 844  | light + dark |

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
- `MUGIWARA_UI_TOKEN` is a paired device token. Never commit or paste the token
  into a PR comment or screenshot.
- `MUGIWARA_UI_SOURCE_PATH` optionally adds local-import search results to the
  add-manga captures.
- `MUGIWARA_UI_OUT` must point outside the repository. Leave it at the default
  `/tmp/mugiwara-ui` if unsure.
- Re-capture after the final UI commit; stale screenshots are not evidence.

Screenshots and recordings belong in PR comments, never in git. Redact bearer
tokens, pairing codes, cookies, API keys and absolute personal paths.

## Troubleshooting

- **`pnpm lint` fails with "command not found"**: run `pnpm install` first;
  ESLint and `typescript-eslint` are root dev dependencies.
- **Lint passes locally but fails in a package**: run
  `pnpm --filter <package> lint` to reproduce with that package's working
  directory.
- **Screenshot capture fails**: check that the server is on `MUGIWARA_UI_URL`,
  the token is valid and the library is non-empty. If Chromium is missing, run
  `pnpm exec playwright install chromium`.
- **Android build fails**: ensure `ANDROID_HOME`/`ANDROID_SDK_ROOT` is set and
  the SDK/build-tools are installed; run `cap:sync` before Gradle.
- **Desktop packaging fails**: run the web and server builds first, and verify
  the electron-builder inputs (`apps/server/dist`, `apps/server/deploy`,
  `apps/web/dist`) exist.
- **Database looks wrong**: use a fresh temporary `DATA_DIR` instead of deleting
  a real library. Migrations run on server start.
