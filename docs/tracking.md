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

Register an OAuth application with each provider and set these server variables:

| Provider    | Variables                                                                             |
| ----------- | ------------------------------------------------------------------------------------- |
| AniList     | `MUGIWARA_ANILIST_CLIENT_ID`, optional `MUGIWARA_ANILIST_CLIENT_SECRET`               |
| MyAnimeList | `MUGIWARA_MAL_CLIENT_ID`, optional `MUGIWARA_MAL_CLIENT_SECRET`, `MUGIWARA_MAL_USER_AGENT` |
| Both        | `MUGIWARA_PUBLIC_URL`, or the `server.publicUrl` setting                              |

Redirect URIs:

- `{publicUrl}/api/trackers/anilist/auth/callback`
- `{publicUrl}/api/trackers/myanimelist/auth/callback`

For a LAN/self-hosted install, `MUGIWARA_PUBLIC_URL` (or `server.publicUrl`) must
be the address phones can reach, for example `http://192.168.1.20:3001`. The
`GET /api/trackers/config` endpoint reports the redirect URI the server will
use. `MUGIWARA_ANILIST_REDIRECT_URI` and `MUGIWARA_MAL_REDIRECT_URI` override the
computed values when a proxy or custom domain is used.

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
