# Contributing to Mugiwara

Thanks for helping improve Mugiwara. This guide covers the workflow, the checks
we expect, and the house rules for the codebase. By participating you agree to
keep discussions respectful and to license your contributions under the terms
below.

## Licensing of contributions

Mugiwara is licensed under the [GNU General Public License v3.0 or later](LICENSE)
(`GPL-3.0-or-later`). By submitting a pull request or patch you confirm that you
wrote the code (or have the right to submit it) and that it may be distributed
under the same license. Do not paste code from projects with an incompatible
license.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For a bug, include the Mugiwara version, platform (web/desktop/mobile),
  browser or OS, and reproduction steps.
- For a feature, describe the user problem first. Small, focused proposals are
  easier to review than large speculative rewrites.
- Do not report security vulnerabilities in a public issue. Email the
  maintainer or use a private advisory instead, and include enough detail to
  reproduce the problem without exposing real tokens or library data.

## Repository layout

| Path           | What lives there                                           |
| -------------- | ---------------------------------------------------------- |
| `apps/server`  | Express API, SQLite/Drizzle, auth, plugins, storage, queue |
| `apps/web`     | The only React UI (browser, desktop and mobile)            |
| `apps/desktop` | Electron main/preload and packaged desktop app             |
| `apps/mobile`  | Capacitor iOS/Android shell                                |
| `packages/*`   | Shared types, plugin API and built-in plugins              |
| `docs/`        | User and contributor documentation                         |

Read [Architecture](docs/architecture.md) before changing package boundaries.
The UI is never forked per platform: platform differences belong in
`apps/web/src/platform/*` or in the shells.

## Development setup

Prerequisites: Node.js >= 20.19 and pnpm >= 11.

```sh
pnpm install
pnpm dev
```

`pnpm dev` starts the server on `:3001`, the web client on `:5173`, and Electron.
See [Getting started](docs/getting-started.md) and
[Development](docs/development.md) for LAN deployment, mobile builds and
packaging commands.

## Gating checks

Run the full gate before opening or updating a pull request:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

`pnpm verify` runs typecheck, lint, tests and the build. The repository has no CI
workflow today, so paste the commands and their results in the pull request. If
a gate cannot run on your machine (for example, no Android SDK), say so and
explain why.

Packaging changes need the relevant packaging command as well:

```sh
pnpm build:app:android          # Android APK
pnpm build:desktop:linux        # Linux installer
pnpm build:desktop:win          # Windows installer
pnpm build:desktop:mac          # macOS installer
```

## Code style

- TypeScript is strict. Keep types explicit at API and plugin boundaries.
- Use the `@/` alias inside `apps/web`.
- Follow the existing double-quote, semicolon and trailing-comma style.
- Prefer `src/components/ui` primitives and Tailwind utilities over bespoke CSS.
- Avoid `any` unless the surrounding boundary already uses it.
- Keep routes authenticated; only `/api/health` and the pairing flow are
  exempt.
- Never log tokens, pairing codes, cookies or request bodies that may contain
  secrets.
- Validate user-controlled paths and plugin package names before touching the
  filesystem.
- Preserve API response compatibility unless the change explicitly updates the
  contract and its docs.

## Tests

Add tests with behavior changes:

- Server tests use Vitest/Supertest with a temporary `DATA_DIR`; never bind the
  real port or touch a real library.
- Web tests use jsdom and Testing Library; pure helper tests sit next to the
  helper.
- Security-sensitive changes (auth, CORS/CSRF, content tokens, plugin installs,
  path handling, queue/downloads) need tests to be mergeable.

```sh
pnpm --filter @mugiwara-manga/server test
pnpm --filter @mugiwara-manga/web test
```

## Pull requests

1. Branch from `main` with a descriptive name: `feat/…`, `fix/…`, `chore/…`.
2. Keep the change focused; leave unrelated refactors for another PR.
3. Update tests, docs and types with the code.
4. Run `pnpm verify` and fix failures instead of skipping gates.
5. Run the extra packaging command if you touched native or packaging code.
6. Include evidence in the PR description:
   - the gate commands and their results;
   - the behavior before/after for a bug fix;
   - a request/response or test output for API changes;
   - screenshots for UI changes, attached as PR comments (never committed).
7. Open the PR and link the issue it resolves.

Conventional-style subjects are appreciated (`feat:`, `fix(server):`,
`docs:`), but clear prose matters more than the prefix.

### UI evidence

UI changes should include screenshots at desktop (1280 × 860) and mobile
(390 × 844), in both light and dark themes. The repo has a Playwright helper:

```sh
MUGIWARA_UI_URL=http://127.0.0.1:3001 \
MUGIWARA_UI_TOKEN=<paired-device-token> \
MUGIWARA_UI_OUT=/tmp/mugiwara-ui \
pnpm screens
```

Attach the PNGs to the PR as comments. Do not commit screenshots, tokens,
databases, `dist/`, `data/` or other generated artifacts.

## Documentation

Update the relevant guide in `docs/` (and `README.md` when the top-level summary
changes) whenever behavior or commands change. Keep `AGENTS.md` in sync for
automated contributors.

## Questions

If something in this guide is unclear, open an issue with the `docs` label or
ask in the pull request. We would rather answer a question than have you guess.
