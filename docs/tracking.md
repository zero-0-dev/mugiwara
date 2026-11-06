# Tracker sync (AniList and MyAnimeList)

Mugiwara mirrors reading progress to AniList and MyAnimeList in both directions.
Tracker sync is optional and never blocks reading or downloading.

## What is stored

- `tracker_accounts` stores one OAuth account per provider, including the
  external user id, username, token expiry and read-only flag.
- Access and refresh tokens are encrypted with AES-256-GCM before they reach
  SQLite. The key comes from `MUGIWARA_TRACKER_ENCRYPTION_KEY`; when it is not
  set the server generates `tracker.key` inside `DATA_DIR` with mode `0600`.
  Tokens are never returned by the API and never logged.
- `tracking` stores one row per `(manga, provider)`, enforced by a unique index.
  It keeps the provider-native score (AniList 0–100, MyAnimeList 0–10), the last
  pushed/pulled timestamps, the last remote `updated_at`, the sync state and a
  conflict snapshot.

## Configuring OAuth

Mugiwara is self-hosted, so official packages **bake the OAuth app credentials
into the build**. The end user does not need to set environment variables or
create OAuth apps.

Release builds provide the credentials as build-time environment variables:

| Build variable | Purpose |
| --- | --- |
| `MUGIWARA_ANILIST_CLIENT_ID` | AniList OAuth app id |
| `MUGIWARA_ANILIST_CLIENT_SECRET` | AniList app secret (AniList requires one for the authorization-code flow) |
| `MUGIWARA_MAL_CLIENT_ID` | MyAnimeList public client id (sent as `X-MAL-CLIENT-ID`) |
| `MUGIWARA_MAL_CLIENT_SECRET` | Optional; leave unset for a public MAL client |
| `MUGIWARA_ANILIST_REDIRECT_URI` / `MUGIWARA_MAL_REDIRECT_URI` | Registered callback URLs |
| `MUGIWARA_MAL_USER_AGENT` | Optional MAL User-Agent override |

Example packaging command:

```sh
cp .env.example .env   # fill in the build-time values once
pnpm build:desktop:linux
```

The build reads `.env` and `.env.local` from the repository root. Real
environment variables take precedence over both files, and `.env.local`
overrides `.env`. The same variables work in CI without a `.env` file.
`.env` is gitignored; commit only `.env.example`. These files are read by the
build steps, not by the packaged server at runtime.

The server build writes `dist/trackers/builtin-trackers.json`, which is copied
into the desktop/server artifact. It is build output, never committed. Runtime
environment variables still take precedence so development and custom builds
can override the baked values without repackaging.
`MUGIWARA_TRACKER_ENCRYPTION_KEY` does not need to be set for packaged builds;
a per-install key is generated in `DATA_DIR/tracker.key` when no key is
configured.

Register these callback URLs with each provider:

- `{publicUrl}/api/trackers/anilist/auth/callback`
- `{publicUrl}/api/trackers/myanimelist/auth/callback`

Packaged desktop builds normally use a loopback callback such as
`http://127.0.0.1:3001/...`; register that exact URL. If the packaged app must
serve phones on the LAN, build with the LAN callback URL (for example
`http://192.168.1.20:3001/...`) and/or use the code-paste fallback. The
`GET /api/trackers/config` endpoint reports the redirect URI the server will
use. `MUGIWARA_PUBLIC_URL` or the `server.publicUrl` setting can still adjust the
base URL at runtime when a proxy or custom domain is used.

Both flows use authorization code + PKCE and a single-use `state` value. The
callback is public because the provider redirects the browser to it; the state
is the CSRF check. If the phone cannot reach the callback, paste the `code`
query parameter into Settings → Tracking. The PKCE verifier stays server-side.

## Push, pull and schedule

- Completing a chapter marks linked rows dirty and schedules a debounced push
  per provider. Marking chapters unread is treated as an explicit local change.
- Manual "Sync now" pulls remote progress. Manga detail exposes separate Pull
  and Push actions.
- Pulls run at server start and on the `tracking.scheduleMinutes` interval
  (default 60 minutes, `0` disables it).
- All provider calls share a per-provider rate gate: about 90 requests/minute
  for AniList and 3 requests/second for MyAnimeList. The dedicated tracker queue
  retries 429/network failures with backoff and records a visible error state.
  It is separate from the chapter download queue.
- Read-only accounts pull progress but never write it back.

## Conflict policy

`chaptersRead` is always the count of locally completed chapters. Changes are
compared using the stored `lastPushedAt`, `lastPulledAt` and the remote
`updated_at`:

1. If local chapters changed since the last push and the remote entry changed
   since the last pull, the row becomes `conflict`. Nothing is applied.
2. If only the remote changed and it has more chapters read, the extra local
   chapters are marked complete and the remote status/score are applied.
3. If the remote reports fewer chapters than local, the row becomes `conflict`
   instead of silently lowering local progress.
4. A conflict dialog offers "Keep local" (push) or "Use remote" (apply the
   remote count). Only this explicit action can lower progress.
5. A push never lowers remote progress unless the user explicitly marked
   chapters unread locally.

Provider status mapping:

| Local        | AniList  | MyAnimeList |
| ------------ | -------- | ----------- |
| reading      | CURRENT  | reading     |
| completed    | COMPLETED | completed  |
| on_hold      | PAUSED   | on_hold     |
| dropped      | DROPPED  | dropped     |
| plan_to_read | PLANNING | plan_to_read |

Scores are stored in the provider's native scale; AniList uses `scoreRaw`
0–100 and MyAnimeList uses 0–10.

## Tests

`apps/server/test/tracker-sync.test.ts` and `tracker-api.test.ts` use mocked
providers. They cover status/score mapping, linking, push, pull, conflicts,
token refresh/expiry, 429 retry, bounded retries and a network failure path.
They never make a real network call.
