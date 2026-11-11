# Authentication and security

## Pairing and bearer tokens

The server uses a single-user bearer-token model. The raw token is shown once;
the database stores only its SHA-256 hash plus the device label, creation time,
last-used time and revocation state.

On first start, the server prints a short-lived pairing code:

```
🔑 First-run pairing code: ABCD2345
   Valid for 10 minutes. Enter it in the Mugiwara app to pair this device.
```

In the app, enter the server address and that code (or paste an access token)
on the Connect screen. Codes are single use and expire after 10 minutes. Once
paired, open **Settings → Security** to:

- see paired devices,
- revoke one device,
- create a pairing code for another device,
- rotate the current token (API: `POST /api/auth/rotate`),
- log out all devices (`POST /api/auth/logout-all`).

The web client stores the token per server origin in `localStorage` and sends
`Authorization: Bearer …` from the single API client. The server also sets an
`HttpOnly`, `SameSite=Lax` session cookie on pairing. That cookie lets
same-origin browser and Electron `<img>` tags load covers and reader pages.

Capacitor and other cross-origin clients request a short-lived (15 minute)
content-scoped signed token from `POST /api/auth/content-token`; the client
appends it as `?contentToken=…` to content URLs. It only works on
`/api/content/*` and is invalidated when the device token is revoked.

The packaged Electron app provisions a token automatically over loopback and
passes it to the renderer through the preload bridge, so desktop setup stays
zero-touch. Set `MUGIWARA_AUTH_TOKEN` to override that for a headless or shared
server. In development Electron reads the same env var or pairs through the
loopback server.

## Environment variables

| Variable                                           | Default                       | Purpose                                                                                                                         |
| -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                             | `3001`                        | HTTP port.                                                                                                                      |
| `HOST`                                             | `0.0.0.0`                     | Bind address. Use `127.0.0.1` for local-only.                                                                                   |
| `DATA_DIR`                                         | `./data`                      | SQLite database, covers and plugin installs.                                                                                    |
| `WEB_DIR`                                          | auto-detect                   | Built web client directory.                                                                                                     |
| `MUGIWARA_ALLOWED_ORIGINS`                         | empty                         | Comma-separated extra CORS origins. Wildcards are ignored; same-origin and known Electron/Capacitor origins are always allowed. |
| `MUGIWARA_TRUST_PROXY`                             | `false`                       | Set to `true` when a reverse proxy terminates TLS (affects secure cookies and client IPs).                                      |
| `MUGIWARA_COOKIE_SECURE`                           | auto                          | Force the `Secure` cookie flag.                                                                                                 |
| `MUGIWARA_AUTH_TOKEN` / `MUGIWARA_BOOTSTRAP_TOKEN` | empty                         | Provision a fixed admin token (minimum 24 characters). The value is never logged.                                               |
| `MUGIWARA_BOOTSTRAP_LABEL`                         | `Bootstrap token`             | Device label for the bootstrap token.                                                                                           |
| `MUGIWARA_TOKEN_TTL_DAYS`                          | `0`                           | Optional bearer-token lifetime in days. `0` means tokens do not expire until revoked.                                           |
| `MUGIWARA_PLUGIN_REGISTRY`                         | `https://registry.npmjs.org/` | Approved npm registry. Must be HTTPS (HTTP is allowed only for localhost).                                                      |
| `MUGIWARA_PLUGIN_ALLOWLIST`                        | empty                         | Comma-separated exact package allowlist. Empty allows the `mugiwara-plugin-*` and `@mugiwara-manga/*` namespaces.               |
| `MUGIWARA_ALLOW_REMOTE_PLUGIN_INSTALL`             | `false`                       | Permit plugin installs while bound to a non-loopback interface.                                                                 |
| `MUGIWARA_PLUGIN_INSTALL_ENABLED`                  | `true`                        | Master switch for plugin installation.                                                                                          |
| `MUGIWARA_PUBLIC_URL`                              | empty                         | Public/LAN base URL used for OAuth redirects; overrides the request origin fallback.                                            |
| `MUGIWARA_TRACKER_ENCRYPTION_KEY`                  | generated                     | Key material for AES-256-GCM tracker token encryption. When unset a key is generated in `DATA_DIR/tracker.key`.                 |
| `MUGIWARA_ANILIST_CLIENT_ID`                       | empty                         | AniList OAuth app id. Baked into packaged builds at build time; runtime env overrides.                                          |
| `MUGIWARA_ANILIST_CLIENT_SECRET`                   | empty                         | AniList OAuth app secret. Baked at build time only; not required at runtime for official packages.                              |
| `MUGIWARA_ANILIST_REDIRECT_URI`                    | derived                       | Override the AniList OAuth callback URL (build-time or runtime).                                                                |
| `MUGIWARA_MAL_CLIENT_ID`                           | empty                         | MyAnimeList public client id. Baked into packaged builds; sent as `X-MAL-CLIENT-ID`.                                            |
| `MUGIWARA_MAL_CLIENT_SECRET`                       | empty                         | Optional MyAnimeList client secret. Omit for a public MAL client.                                                               |
| `MUGIWARA_MAL_REDIRECT_URI`                        | derived                       | Override the MyAnimeList OAuth callback URL (build-time or runtime).                                                            |
| `MUGIWARA_MAL_USER_AGENT`                          | Mugiwara default              | Optional User-Agent sent to the MyAnimeList API.                                                                                |

## CORS, CSRF and body limits

CORS never uses `*`: only configured origins, the request's own origin, and the
known Electron/Vite (`http://localhost:5173`) and Capacitor
(`http://localhost`, `https://localhost`, `capacitor://localhost`) origins are
allowed, with `Access-Control-Allow-Credentials: true`. Disallowed preflights
are rejected with `403`.

State-changing requests that use cookie authentication must have a valid
`Origin` (or be same-origin/non-browser). `application/x-www-form-urlencoded`
writes are rejected with `415`; API writes use JSON. The global JSON body limit
is 1 MB, with a 20 MB limit for `/api/library/import`.

Auth and expensive routes (discovery, source search, metadata, storage scans,
plugin install/update) are rate limited. Auth failures, plugin
install/uninstall/update and destructive operations are written to the
`audit_logs` table; audit rows never contain tokens, pairing codes or request
bodies.

## Security checklist for operators

- Never log tokens, pairing codes or request bodies that may contain secrets.
- Put the server behind HTTPS and a reverse proxy before exposing it beyond a
  trusted LAN.
- Set `HOST=127.0.0.1` if only the local machine should reach the API.
- Review paired devices in **Settings → Security** and revoke anything you no
  longer recognize.
- Keep plugin installs disabled on servers exposed to untrusted networks unless
  you have configured an allowlist and HTTPS registry.
