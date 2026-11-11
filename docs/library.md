# Library data, progress and reading status

The library is served by `GET /api/library/filter` (the legacy `GET /api/manga`
returns the same aggregates). For each manga:

- **Chapter count** is the number of distinct chapters, independent of how many
  progress rows exist.
- **Progress** is the most recent progress row across all devices, enriched with
  `percentComplete` and `isCompleted` (`isCompleted` is true at the last page or
  at >= 95% of the chapter). Raw database rows are not exposed to clients.
- **Reading status** is manga-level:
  - `reading`: the manga has progress rows, but not every chapter is completed.
  - `completed`: the manga has at least one chapter and every chapter has a
    completed latest progress row across devices.
  - `not-started`: the manga has no progress rows at all.

`GET /api/library/filters/options` counts distinct manga for each reading
status. `notStarted` is counted directly (not by subtracting other buckets), so
it cannot go negative.

## Progress storage

Progress is stored per device as one row per
`(mangaId, chapterId, deviceId)`. The shared web client creates a random UUID
once, persists it in `localStorage` under `mugiwara.deviceId`, and sends it with
every progress write.

Library cards and filters use the newest row across devices. Older clients that
omit a device id are stored under the `default` device. A unique index plus
`ON CONFLICT` upsert makes duplicate/double-submit writes idempotent; the
migration also deduplicates existing rows, keeping the latest `lastReadAt` per
key.

## Library navigation

Library search, filters and sort live in query parameters (`q`, `status`,
`type`, `genre`, `category`, `reading`, `sort`, `order`) so reloads,
back/forward and shared links restore the list. Transient UI state stays local.

See [Architecture](architecture.md) for how the web client and server split
responsibility.
