# Plugins

Mugiwara has two plugin types:

- **Source plugins** discover and fetch manga and chapters.
- **Storage plugins** store pages and metadata.

Built-in plugins ship with the server:

- `@mugiwara-manga/source-local` — local-filesystem source.
- `@mugiwara-manga/storage-local` — local-filesystem storage backend.

Built-in source and storage plugins keep working and cannot be uninstalled.
The public contract lives in `packages/plugin-api`; treat interface changes as
breaking API changes and document them.

## Installing plugins

Plugin installation is admin-only and requires `confirm: true` in the request
body (the UI asks for confirmation). npm runs with `--ignore-scripts`, no audit
or funding checks, and the configured registry.

Packages must match the approved namespace or explicit allowlist and the
`mugiwara-plugin-*` / `@mugiwara-manga/*` name pattern. When the server is bound
to a non-loopback interface, installs and updates are disabled unless
`MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL=true`.

Relevant environment variables:

| Variable                               | Default                       | Purpose                                                                                                           |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `MUGIWARA_PLUGIN_REGISTRY`             | `https://registry.npmjs.org/` | Approved npm registry. Must be HTTPS (HTTP is allowed only for localhost).                                        |
| `MUGIWARA_PLUGIN_ALLOWLIST`            | empty                         | Comma-separated exact package allowlist. Empty allows the `mugiwara-plugin-*` and `@mugiwara-manga/*` namespaces. |
| `MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL` | `false`                       | Permit plugin installs while bound to a non-loopback interface.                                                   |
| `MUGIWARA_PLUGIN_INSTALL_ENABLED`      | `true`                        | Master switch for plugin installation.                                                                            |

## Where plugins run

The server loads built-in and installed plugins through
`apps/server/src/plugins/*`. Installed plugins are discovered from `DATA_DIR` and
are subject to the same auth and rate limits as the rest of the API. Plugin
install, update and uninstall operations are written to `audit_logs`.

## Writing a plugin

Use `packages/plugin-api` for the interfaces and `packages/source-local` /
`packages/storage-local` as reference implementations. A plugin package should:

1. Depend on `@mugiwara-manga/plugin-api` (and `@mugiwara-manga/types` when it
   exposes shared domain types).
2. Export the source or storage contract expected by the server.
3. Use the `mugiwara-plugin-*` or `@mugiwara-manga/*` naming convention.
4. Avoid install-time scripts; the server installs with `--ignore-scripts`.
