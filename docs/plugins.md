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

## Installing from a local tarball

Admins can install a plugin straight from a `.tgz` / `.tar.gz` package without
publishing it to a registry. This is the intended workflow while developing a
plugin.

Archive format: a normal npm package tarball, for example the output of
`npm pack`. It must contain `package.json` (at `package/package.json` or at the
archive root) with the usual Mugiwara fields:

```json
{
  "name": "mugiwara-plugin-source-example",
  "version": "1.2.3",
  "main": "dist/index.js",
  "mugiwara": { "type": "source", "id": "example", "compatibleCore": "^1.0.0" }
}
```

Install it from **Settings → Plugins → Install from tarball**, or with the API:

```sh
curl -X POST http://localhost:3001/api/plugins/install-tarball \
  -H "Authorization: Bearer $TOKEN" \
  -F "confirm=true" \
  -F "tarball=@mugiwara-plugin-source-example-1.2.3.tgz"
```

Behavior:

- The package name and version are read from the `package.json` inside the
  archive, not from the file name.
- The package is extracted to `DATA_DIR/plugins/node_modules/<name>` and a row
  is written to `installed_plugins` exactly like an npm install. The archive is
  kept in `DATA_DIR/plugins/tarballs/<package>/` and recorded as a `file:`
  dependency in `DATA_DIR/plugins/package.json` so later npm operations keep it
  installed.
- Uploading the same package name again replaces the previous version: the old
  `node_modules` directory and tarball are removed, the DB row is updated to the
  new version, and the existing plugin config and install date are preserved.
  Only the most recently uploaded tarball is retained.
- If the archive vendors `node_modules`, it is used as-is. Otherwise declared
  runtime dependencies are installed with npm (`--omit=dev --ignore-scripts`)
  from the configured registry.
- Installs are admin-only, require `confirm=true`, are rate-limited, are capped
  at 32 MB (256 MB decompressed), and written to `audit_logs`. Archive paths
  are validated and symlinks, hard links and device files are rejected.
- Replacing a plugin reloads it in the running server, so no restart is needed.

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
