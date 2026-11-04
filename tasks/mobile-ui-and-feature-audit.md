# Mobile / Capacitor UI & feature audit

**Date:** 2026-11-03
**Scope:** `apps/web` (shared UI), `apps/mobile` (Capacitor shell), `apps/server` APIs touched by the UI.
**Method:** code review + headless Chromium at 390×844, 320×640 and 844×390
(portrait phone, small phone, phone landscape), dark and light themes, with a
real library/chapter/reader dataset. Physical iOS/Android, safe-area hardware
and real touch gestures were **not** available, so those items are marked
"verify on device".

The screenshots/measurements used for this audit were taken from a temporary
server and are not committed.

---

## 0. TL;DR

The migration preserved the feature set but not the *mobile interaction model*.
The biggest problems are structural, not cosmetic:

1. **The Settings screen cannot scroll on phones.** Everything below the first
   section is unreachable.
2. **The reader is not full-screen.** Its fixed controls sit on top of the app
   header, and when the controls auto-hide the global header reappears.
3. **“Add Manga → Local Files” is broken everywhere.** The path input is
   read-only and the Browse button is a no-op.
4. **Navigation is in-memory only.** Android back exits the app, browser back
   leaves the app, and library search/filters/scroll are lost when you open a
   manga and come back.
5. **Swipe gestures are gone.** The reader is tap-only; horizontal page swipes
   and edge-swipe chapter changes from the RN client were not reimplemented.
6. Several **data bugs** make the library lie: chapter counts are inflated when
   progress exists, reading-progress bars never render, and the queue renders a
   literal `00`.
7. The server has **no auth, wildcard CORS, and a form-reachable npm install
   endpoint**. Any web page can trigger plugin installation on a LAN/self-hosted
   server; this is effectively unauthenticated RCE.

Fix the P0 list before adding sync or a UI library.

---

## 1. P0 — breaks usability

### 1.1 Settings is unscrollable on mobile

- **Symptom:** On a 390×844 phone, Reading only shows the first two settings;
  Storage/Plugins/Queue/About content is cut off and cannot be reached.
- **Evidence:** `.settings-page` has `clientHeight 787`, `scrollHeight 1437`,
  `overflow: hidden`; `.settings-content` has `overflow: visible`. The document
  itself does not scroll.
- **Cause:** `apps/web/src/index.css:3556-3585` makes the settings layout a
  column and explicitly disables the content scrollbar, while the parent
  `.settings-page` keeps `overflow: hidden` (`:1608-1613`).
- **Fix:** let `.settings-page` (or `.app-main`) scroll on mobile:
  `.settings-page { overflow-y: auto; -webkit-overflow-scrolling: touch; }`
  and remove `max-height`/`overflow: visible` overrides. Add
  `padding-bottom: max(1rem, env(safe-area-inset-bottom))`.

### 1.2 Reader collides with the global header / is not immersive

- **Symptom:** Opening a chapter leaves the “Mugiwara / Library / Discover /
  Settings” header visible. The reader’s fixed top controls (Back, mode, page
  indicator) render at `top: 0`, directly over that header. When the controls
  auto-hide, the header reappears underneath.
- **Evidence:** `.app-header` = 0–57px; `.reader` starts at y=57 but is
  `height: 100dvh` (844px) inside a 787px `.app-main`; `.top-controls` is
  `position: fixed; top: 0`.
- **Cause:** `Reader.tsx:249-280` + `App.tsx:242-284` + `.reader` CSS
  (`index.css:1431-1443`, `:1462-1488`).
- **Fix:** hide the app header and bottom nav for the reader route, make the
  reader `height: 100%`, and use only the reader controls; or make the reader a
  real full-screen route/portal. Add `padding-top: max(0.5rem,
  env(safe-area-inset-top))` to top controls.

### 1.3 Add Manga → Local Files cannot be used

- **Symptom:** Selecting the built-in “Local Files” source shows a read-only
  “Enter folder path or browse…” input; tapping “Browse…” does nothing. There
  is no way to import a local folder from the Add Manga modal on any platform.
- **Cause:** `SearchStep.tsx:57` sets `readOnly={isLocal}`;
  `AddMangaModal.tsx:230` passes `onBrowse={() => {}}`.
- **Fix:** restore `window.electronAPI.selectFolder()` on desktop, and provide a
  server-side directory browser (or a text input) for web/mobile. If scanning
  storage is the intended flow, remove Local Files from Add Manga and point the
  user to Settings → Storage → Scan.

### 1.4 Queue stats overflow + literal `00`

- **Symptom:** On 390px the four stat cards are wider than the content area and
  the Error card is clipped; at 320px it is mostly off-screen. A literal “00”
  appears under the cards.
- **Evidence:** `.queue-stats` is `repeat(4, 1fr)` with min-content widths
  (grid `scrollWidth 379` vs `314` available); `queue-actions` text is `"00"`.
- **Cause:** `index.css:2230` has no mobile override; `QueueSection.tsx:44-49`
  uses `stats.error && (...)` and `stats.complete && (...)`; when the value is
  `0`, React renders the number `0`.
- **Fix:** `grid-template-columns: repeat(2, minmax(0, 1fr))` on mobile
  (or auto-fit); use `(stats.error ?? 0) > 0` and `(stats.complete ?? 0) > 0`.

### 1.5 Library chapter counts are inflated; progress bars never render

- **Symptom:** A manga with 8 chapters shows “16 chapters” after two chapters
  have progress. Reading progress bars on library cards never appear.
- **Cause A:** `/api/library/filter` does
  `LEFT JOIN reading_progress` + `LEFT JOIN chapters` + `count(chapters.id)`
  and `GROUP BY manga.id` (`apps/server/src/api/filters.ts:56-83`). One progress
  row per chapter multiplies the chapter rows, so the count becomes
  `chapters × progress`.
  `mangaRepository.getWithProgress()` has the same bug
  (`apps/server/src/database/repositories/manga.ts:69-89`).
- **Cause B:** The same endpoint returns the **raw** `reading_progress` row
  without `percentComplete`/`isCompleted`. `Library.tsx:206` checks
  `m.progress.percentComplete > 0`, so the bar is never rendered. Even if the
  API were fixed, `.progress-bar` has `position: absolute` commented out
  (`index.css:540-547`), so the bar would be laid out below the cover and
  clipped by `overflow: hidden`.
- **Fix:** use `count(distinct chapters.id)` or subqueries; select only the
  latest progress row per manga (or aggregate); enrich with
  `enrichProgressRecord`; restore `position: absolute` for `.progress-bar`.
  Add a regression test with 1 manga, 8 chapters, 3 progress rows.

### 1.6 No back navigation / no routing

- **Symptom:** Android system Back closes the app instead of going back;
  browser Back leaves the app; reader has no history entry; Cmd/Ctrl+Back etc.
  do nothing. Opening a manga and returning resets library search, filters,
  sort and scroll.
- **Evidence:** `App.tsx:40-48` is a `useState` view union; no router, no
  `popstate`, no `@capacitor/app` back-button listener. Verified: after typing
  “test”, opening a manga and returning, the search field is empty.
- **Fix:** move to React Router/TanStack Router with URLs
  (`/`, `/manga/:id`, `/read/:mangaId/:chapterId`, `/settings/:tab`), keep list
  state in the URL, restore scroll, and wire `App.addListener('backButton')` to
  `history.back()` (exit only at the root). This also enables deep links and
  share.

### 1.7 Android safe area / system bars (verify on device)

- **Risk:** `targetSdk 36` enforces edge-to-edge. The CSS uses
  `env(safe-area-inset-*)`, but Capacitor 8’s Android `SystemBars` plugin
  injects `--safe-area-inset-*` CSS variables instead. On WebViews where
  `env()` is not populated, the app header will sit under the status bar and the
  reader controls under the navigation bar.
- **Files:** `index.css:3427, 3639-3647`, `apps/mobile/capacitor.config.ts`
  (no `SystemBars` config), `styles.xml`.
- **Fix:** use a fallback:
  `padding-top: max(10px, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))`
  everywhere; configure `plugins.SystemBars.style` (`DARK`/`LIGHT`) and update
  it when the app theme changes. Test on Android 15/16 and iOS with notch.

### 1.8 The server is unauthenticated and CSRF-able (security)

- **Risk:** `app.use(cors())` (`apps/server/src/index.ts:75`) and no auth. The
  plugin install endpoint (`/api/plugins/install`) accepts a package name and
  runs `npm install` (`plugins/installation.ts:67`) with lifecycle scripts
  enabled. `express.urlencoded` is enabled, so a malicious website can submit
  a form POST (no preflight) to `http://localhost:3001` /
  `http://192.168.x.x:3001` and install `mugiwara-plugin-*` packages, which can
  execute arbitrary code on the server. Wildcard CORS also lets any origin read
  the library.
- **Fix first:** require a bearer token/pairing secret on all `/api` routes,
  restrict CORS to the app origins, reject form-encoded writes, add CSRF/origin
  checks, install plugins with `--ignore-scripts`, and keep plugin installation
  disabled on remote interfaces unless explicitly enabled.

---

## 2. Mobile layout / visual issues by screen

### App shell / header

- No mobile bottom navigation. Library/Discover/Settings are 36–40px icon-only
  buttons in the top-right; labels exist only in the DOM (`font-size: 0`), so
  discoverability is poor. The old RN app had a tab bar. Add a bottom tab bar
  with safe-area padding and badge support.
- Settings has no active state in the header (`.btn-icon` only).
- Header remains visible in the reader (see 1.2).
- Landscape phones (e.g. 844×390) do **not** match `@media (max-width: 768px)`,
  so they get the desktop layout with a huge header and 2-column settings.
  Use `(max-width: 900px), (pointer: coarse)` or `(max-height: 500px)`.
- Header/titlebar padding only uses `--titlebar-inset-left`; landscape notch
  safe areas (`env(safe-area-inset-left/right)`) are not accounted for.
- `theme-color` is hard-coded `#1a1a1a`; light theme leaves a dark status bar.
- No `manifest.webmanifest`, apple-touch-icon or splash metadata. PWA install
  from the LAN/HTTPS is unbranded.

### Library

- Search fires a request on every keystroke (no debounce). On a LAN this is
  cheap; with 10k manga or remote sources it is wasteful. Add `useDebounce`.
- Opening a manga unmounts the Library; search/filters/sort/scroll reset on
  return (see 1.6).
- The delete button is always visible on touch (`@media (hover:none)`), at 28px
  on a ~105px card. It covers artwork and is easy to hit accidentally. Prefer
  long-press/selection mode or an overflow menu.
- Reading progress bars do not render (see 1.5).
- No pull-to-refresh and no infinite scroll/pagination; the grid renders every
  manga at once.
- Card and grid are not virtualized (PRD targets 10k+ manga).
- Hover transforms on `.discover-card`, `.result-card`,
  `.add-manga-result-card`, `.continue-reading-btn` are not reset on
  `hover:none`; tapped cards stay lifted until the next tap.
- The cover height is fixed (240 desktop / 155 mobile) instead of
  `aspect-ratio: 2/3`; cards have inconsistent crop ratios across widths.
- Clickable cards/chapters are `<div>`s with `onClick`; no keyboard focus,
  `role`/`tabIndex`, or Enter support.

### Manga detail

- Long titles collapse into a narrow column: `.manga-title-row` keeps
  Auto-fetch/Search (≈200px) beside the title with `flex-shrink: 0`, so at
  320px “Test Manga With A Very Long Title” becomes one word per line.
  Stack metadata actions below the title on mobile and let the title span the
  row (`index.css:988-1006, 3513-3520`).
- At 320px chapter rows overflow: measured `scrollWidth 339` vs `292`; the
  chapter title is squeezed to ~57px and wraps, while the progress/pages/menu
  block extends past the card. Hide the percentage/pages on narrow screens or
  stack `.chapter-meta` under the title; add `min-width: 0`/ellipsis.
- “Start Chapter Chapter 1” / “Continue Chapter CHAPTER 1” duplicates
  “Chapter” (`MangaDetail.tsx:168-172`); use a readable label derived from
  `chapter.title`.
- Category dropdown is clipped by `.manga-info-collapsible { overflow: hidden;
  max-height: 400px }`: measured dropdown bottom 513 vs container bottom 464,
  so the last category is cut off. It also has no click-outside handler and is
  not portaled. Use `createPortal`, a sheet on mobile, or remove clipping when
  expanded.
- `dangerouslySetInnerHTML` renders AniList descriptions un sanitized
  (`MangaDetail.tsx:393`). A malicious/compromised metadata response or source
  could inject HTML with event handlers. Sanitize with DOMPurify on the server
  or client.
- Metadata “Search” uses a raw `fetch`, has no loading/error/abort state and
  races if clicked repeatedly (`MangaDetail.tsx:196-206`). Use the existing
  `useMutation`/API client.
- Chapter menu is `position: fixed` with a hard-coded 200px height and does not
  follow the anchor if the list scrolls. Fine on desktop, awkward on mobile;
  use a bottom sheet or reposition on scroll.
- The “Download all” / “Check for updates” actions are left-aligned on their
  own row at mobile; the header becomes two lines. Consolidate into an overflow
  menu.
- The description collapse leaves a large empty gap before the “Show more”
  link when content is short; only show the toggle when it overflows.

### Reader

- Page turns are tap-only. No horizontal swipe, no swipe-at-edge chapter
  change, no pinch/double-tap zoom, no preloading of adjacent pages. On a slow
  LAN page turns show black/blank until the image loads.
- Empty chapter shows “Loading chapter…” forever: `if (pagesLoading ||
  pages.length === 0) return <loading>` makes the separate empty state
  unreachable (`Reader.tsx:234-240`).
- Broken image pages show the browser’s enormous “Page N” alt text; add an
  `onError` retry/fallback.
- Long-press/right-click on a paged page triggers `handleContextMenu` and
  navigates to the previous page, even for touch. Check `pointerType` and
  only handle mouse right-click.
- Progress restore can overwrite the saved page: the restore effect runs
  before `chapterProgress` is guaranteed to be loaded and sets
  `hasRestoredProgress`, so the 500ms save effect can write page 1 first.
  Wait for the progress query and ignore saves until restored
  (`Reader.tsx:80-113`).
- Out-of-order progress writes can regress: fast page turns produce parallel
  POSTs; a late older request can overwrite a newer page. Add a client sequence
  number or `updatedAt` conflict check.
- At the last chapter the Next button remains enabled (onNextChapter is always
  passed); at the first chapter Previous is enabled. Pass availability or
  disable at the boundaries (`App.tsx:94-120`, `Reader.tsx:274-280`).
- `initialPage=-1` (previous chapter) can be overridden by the saved progress
  restore, so “previous chapter” may not start at the last page.
- No chapter title, no page scrubber, no chapter list drawer, no “next chapter”
  transition card, no wake lock / fullscreen / brightness. The old RN reader
  had a vertical edge-swipe chapter change and transition items.
- `controlsTimeoutRef` is not cleared on unmount, and the auto-hide timer can
  fire while a native `<select>` picker is open.
- Vertical mode renders every page at once with no `aspect-ratio` placeholder.
  The API already returns `width`/`height`; use them to reserve space and avoid
  scroll jumps, and `content-visibility: auto` for long chapters.
- `overscroll-behavior: none` is on `.reader`, not on the scrolling
  `.reader-content`; pull-to-refresh/overscroll can still fight vertical
  scrolling.

### Settings

- Cannot scroll (1.1).
- The mobile nav row is a horizontal scroll with the last tab (“About”)
  clipped; no fade/arrow affordance.
- At 320px settings rows are badly squeezed: “Reading Preferences” wraps to two
  lines and “Choose between dark and light appearance” becomes one word per
  line because `.setting-control` (the custom select) does not shrink.
  `.setting-item { flex-wrap: wrap }` does not stack reliably. Use
  `flex-direction: column; align-items: stretch` and full-width controls.
- The settings page has a second header (Back + Settings) under the global
  header, wasting ~60px on phones; merge them or hide the global header.
- Custom `Select` is 14px text (iOS auto-zooms) and the dropdown is clipped by
  the scrolling content; long labels can overflow. Use native `<select>` or a
  bottom sheet on touch.
- Storage “Add Storage Backend” / “Scan Storage” buttons wrap onto two lines
  at 390px because they use fixed padding and no `white-space: nowrap` /
  flex wrap container (`StorageSection.tsx:173-178`).
- Storage modals use inline fixed `90vh` (not `dvh`), 24px padding and no
  safe-area bottom; on iPhone the form can sit under the keyboard/home bar.
- “Set as default backend” in the Edit dialog does nothing: the client puts
  `isDefault` inside `config` (`StorageSection.tsx:76`), but the API expects a
  top-level `isDefault` and the hook only sends `config`
  (`hooks.ts:602-611`, `storage.ts:83-95`).
- No Categories management UI. The API (`/api/categories`) and old RN
  Categories tab are there; the web settings never expose create/rename/delete.
- The Storage/Plugins/Queue tabs use raw JSON textareas and unstyled inline
  components; not mobile-friendly.
- The About tab (server address/change server) is unreachable on mobile because
  of the scroll bug.
- Theme change is applied only after settings load; there is a dark flash in
  light mode, and `document.documentElement` lacks `color-scheme`.

### Discover

- **The Search button does nothing** (`handleSearch() {}`
  `Discover.tsx:65-67`). Search only happens as a side effect of typing,
  firing an AniList request on every keystroke (`filters` is part of the
  `useInfiniteQuery` key). AniList rate limits; this will get 429s. Add a
  debounce + submit-on-Enter, and use the button.
- While a search is fetching, the grid disappears and the page shows only a
  spinner; keep previous results (`placeholderData: keepPreviousData`).
- AniList errors are not surfaced; a failed request looks like “No manga
  found”. Add an error/retry state.
- No infinite scroll; “Load More” only.
- `DiscoverDetail` calls `setSelectedSource` during render via a `useRef`
  guard (`DiscoverDetail.tsx:48-55`). Move to `useEffect`; also handle the
  zero-remote-sources case instead of showing “No results found in this
  source”.
- Category chips scroll horizontally; the active chip can be off-screen after
  selection. Scroll it into view.
- No NSFW filter even though `ui.showNSFW` exists.

### Add Manga modal

- Local Files flow is broken (1.3).
- Import progress UI is unreachable: `onSuccess` closes the modal as soon as
  the import request returns, and only then dispatches `IMPORT_START`
  (`AddMangaModal.tsx:150-160, 262-269`). Users get no feedback while chapters
  download. Either keep the modal open until the queue settles or show a toast
  and a badge in the library/queue.
- Mobile bottom sheet has no safe-area bottom padding, no drag handle, and no
  keyboard avoidance (Add Manga / search inputs can hide under the keyboard).
- Browse button and search input stack full width; acceptable but the huge
  blue “Search” button duplicates Enter.
- The “Enter to search” hint is shown on mobile where there is no Enter key.

### Server setup

- If the saved server is temporarily unreachable, `resolveServer()` returns
  `needsSetup: true` and replaces the app with the setup wizard
  (`platform/server.ts:89-102`). A Wi-Fi hiccup should not discard the
  configured server; show an offline/retry state and keep the URL.
- No server discovery/QR. Typing `http://192.168.x.y:3001` on a phone is the
  worst part of first-run. Add mDNS/hostname discovery and a QR code in the
  server log/desktop settings.
- Server URL lives in `localStorage`; use Capacitor Preferences for durability
  on iOS.

### Global CSS / touch polish

- Only one width breakpoint (`max-width: 768px`). Landscape phones and tablets
  fall through to desktop; use `pointer: coarse`/`max-height` too.
- iOS auto-zoom: search inputs are 14px, server setup 15px, reader select 13px,
  Storage inline inputs 14px. Use `font-size: 16px` on focusable controls on
  mobile.
- Toast container is bottom-right with `max-width: 400px`; on a 320px screen a
  long message can extend past the left edge and overlap the bottom controls.
  Use `left/right: 1rem; max-width: none` and safe-area bottom on mobile.
- `@media (hover:none)` only resets two hover transforms (see Library).
- No `prefers-reduced-motion` handling for the many 0.2–0.3s transitions.
- No focus-visible styling on `.manga-card`, `.chapter-item`, `.discover-card`,
  `.result-card`; modals do not trap focus or set `role="dialog"`.
- Scrollbars are styled globally, including inside the reader.

---

## 3. Gestures & native-shell gaps

The RN client had:

- horizontal `FlatList pagingEnabled` page swipes;
- previous/next chapter transition items at the ends;
- vertical reader `PanResponder` edge swipes to change chapter;
- native stack swipe-back/navigation;
- safe-area insets and a tab bar.

The Capacitor web UI currently has:

- tap zones only (`Reader.tsx:180-212`); the `.click-zones` elements are dead
  (`pointer-events: none`, no handlers);
- no swipe-at-edges;
- no pinch/double-tap zoom (`touch-action: manipulation` on `.reader`);
- no native back/edge-swipe handling;
- no tab bar.

Recommended implementation:

1. **Paged reader:** use CSS scroll-snap (also recommended by
   `tasks/platform-portability-strategy.md`):
   `display:flex; overflow-x:auto; scroll-snap-type:x mandatory;
   overscroll-behavior-x:contain; touch-action:pan-x pinch-zoom;` with each page
   `flex:0 0 100%; scroll-snap-align:center; scroll-snap-stop:always;`.
   Use `scrollend` (with a scroll fallback) to update progress; preload ±2
   pages. For RTL, set `dir="rtl"` on the scroller or reverse the array.
2. Add sentinel slides at both ends (“Previous/Next chapter”) or detect
   overscroll to trigger chapter changes, matching the old HorizontalReader.
3. **Vertical reader:** add pointer-based horizontal swipe detection at
   top/bottom edges (threshold ~60px) for chapter changes; don’t interfere with
   vertical scrolling.
4. **Zoom:** allow native pinch zoom (`touch-action: pinch-zoom`) and add a
   double-tap toggle; optionally use a zoom/pan library for paged mode.
5. **Shell:** add `@capacitor/app` for `backButton`, `@capacitor/haptics` for
   page-turn feedback, `@capacitor/status-bar`/`SystemBars` for bar style,
   and `@capacitor/keyboard` for resize behavior.
6. Add a bottom tab bar on phones; the old RN tabs are the missing navigation
   affordance. iOS edge-swipe back can be implemented in the router or by a
   left-edge pointer gesture, but avoid conflicting with the reader.

---

## 4. API / data bugs found while testing

| # | Bug | Detail / fix |
|---|---|---|
| 4.1 | `chapterCount` inflated | `LEFT JOIN reading_progress` multiplies chapter rows before `count()`. Verified 8 → 16 with 2 progress rows. Use `count(distinct chapters.id)` or subqueries. |
| 4.2 | Arbitrary progress row | `GROUP BY manga.id` picks an arbitrary joined progress row; for a manga with several chapters it may not be the latest. Use a correlated subquery/`max(last_read_at)`. |
| 4.3 | Missing computed progress | `/api/library/filter` and `/api/manga` return raw progress without `percentComplete`/`isCompleted`; the shared type promises them. Enrich before returning. |
| 4.4 | Reading status filters are per-row | `readingStatus=completed` matches a manga if *any* chapter row is complete; `reading` likewise. Define semantics (latest chapter vs any) and aggregate first. |
| 4.5 | Reading status counts are wrong | `/api/library/filters/options` counts progress rows, not distinct manga; `notStarted` subtracts those counts and can go negative. The client expects `readingStatuses: string[]`, not an object. |
| 4.6 | Duplicate progress rows | No unique index on `(mangaId, chapterId, deviceId)`; `upsert` is read-then-write, so concurrent requests can insert duplicates. Add a unique index and atomic upsert. |
| 4.7 | `deviceId` unused by the web client | Every device writes the same row; PRD US-015 (multi-device sync) is not implemented. Send a device ID and decide conflict policy. |
| 4.8 | `DATA_DIR` not honored for covers/thumbnails | `metadata.ts:221` and `content.ts:162,191` use `process.cwd()/data`, while the DB/plugins use `DATA_DIR`. Docker/NAS deployments write covers to the wrong place. Add a shared `getDataDir()`. |
| 4.9 | AniList 429 not handled | `AniListService.request` returns `null` on any error; Discover shows “No manga found”. Add retry/backoff and surface the error. |
| 4.10 | No pagination on library | `/api/library/filter` returns every manga + progress; 10k+ target. Add cursor/limit and virtualize. |
| 4.11 | Sync fetch blocks | `GET /chapters/:id/pages` downloads a chapter synchronously if not in storage. On mobile this is a long white/black spinner. Queue the download and return a pending state. |
| 4.12 | Metadata description bug | `description?.substring(0,200) + "..."` yields `"undefined..."` for null descriptions. |
| 4.13 | XSS surface | Unsanitized AniList HTML rendered via `dangerouslySetInnerHTML`. |

---

## 5. Tracking provider sync (MyAnimeList / AniList / Kitsu)

The schema already has `tracking` and `manga.anilistId`, and the shared
`TrackingInfo` type exists, but there is no repository, API or UI.

### Recommended architecture

Add a `services/trackers/` layer behind a common interface:

```ts
interface Tracker {
  id: "anilist" | "mal" | "kitsu";
  authUrl(state: string, pkce: Pkce): string;
  exchangeCode(code: string, verifier: string): Promise<Tokens>;
  refresh(tokens: Tokens): Promise<Tokens>;
  search(title: string, year?: number): Promise<TrackerCandidate[]>;
  getEntry(id: string): Promise<TrackerEntry>;
  updateEntry(id: string, patch: TrackerPatch): Promise<void>;
  listEntries(): Promise<TrackerEntry[]>;
}
```

Storage:

```sql
tracker_accounts (
  id, provider, external_user_id, username,
  access_token_enc, refresh_token_enc, expires_at,
  created_at, updated_at
)
tracking (
  id, manga_id, provider, tracker_manga_id,
  status, score, chapters_read,
  remote_updated_at, last_pushed_at, last_pulled_at,
  sync_state,            -- linked | pending | conflict | error
  created_at, updated_at,
  unique(manga_id, provider)
)
```

- Encrypt tokens at rest (AES-256-GCM with a key in `DATA_DIR` or env); never
  send them to the browser. Add server auth first (see 1.8).
- Endpoints:
  - `POST /api/trackers/:provider/auth/start` → `{ url, state }` (PKCE)
  - `GET  /api/trackers/:provider/auth/callback` → exchange + store + redirect
  - `GET  /api/trackers/accounts`, `DELETE /api/trackers/:provider`
  - `GET/PUT /api/manga/:id/tracking` (status/score/chapters)
  - `POST /api/manga/:id/tracking/link` (search candidates / manual pick)
  - `POST /api/trackers/:provider/sync` (push), `POST .../pull`
- Trigger pushes on chapter completion (debounced), on manual “Sync now”, and
  nightly (`node-cron` is already a dependency). Use a small job queue/rate
  limiter: MAL ~3 req/s, AniList ~90 req/min.
- Conflict policy: compare `remote_updated_at` with local `last_pushed_at`;
  never lower remote progress unless the user explicitly marks chapters unread;
  show a conflict dialog if both changed.
- Progress value: count completed chapters (not the current page index); this
  matches MAL `num_chapters_read` and AniList `progress`.
- Matching: AniList already has `anilistId` from metadata. MAL/Kitsu need a
  title/year/alt-title search with a manual confirmation picker. Store
  `tracker_manga_id`; allow re-linking.
- Score scales differ (MAL 0–10, AniList 0–100 raw / 0–10 decimal). Store the
  provider-native value and display the scale in the UI.
- OAuth redirect caveat: MAL/AniList require a registered redirect URI. For a
  self-hosted LAN server, document a configurable `server.publicUrl` and use a
  server callback page; support “paste the code” as a fallback for phones. Test
  the flow from the phone browser, not just localhost.
- UI: Settings → Tracking (connect/disconnect, last sync, sync now), Manga
  detail → Tracking card (status/score/progress/link/unlink), library badge for
  sync state, and a conflict dialog.
- Rollout: AniList first (IDs already stored, one GraphQL endpoint), then MAL.
  Kitsu is lower priority.

---

## 6. UI cohesion / component library

Current state:

- ~3,700 lines of global CSS, plus four `<style>{...}</style>` blocks and
  inline style objects (`Discover`, `DiscoverDetail`, `MangaDetail`,
  `StorageSection`).
- Duplicated selectors: `.btn-icon` (twice), `.chapter-title` (three times),
  `.progress-bar` used for unrelated bars, `.header-actions` reused for the app
  header and the settings header.
- Custom `Select`, dropdowns, menu and toast; no focus trap, ARIA roles or
  keyboard navigation.
- Two spacing systems: CSS variables (`--space-*`) and hard-coded px/rem.

Options:

**A. Radix primitives + existing tokens (lowest risk, recommended first).**
Adopt `@radix-ui/react-dialog`, `dropdown-menu`, `select`, `switch`, `tabs`,
`toast`, `scroll-area`, `tooltip`; wrap them in `components/ui`; use `vaul`
for bottom sheets. Keep the existing CSS variables and look. This fixes
accessibility/focus/menus without a visual rewrite. Then consolidate styles
screen by screen.

**B. shadcn/ui + Tailwind (best long-term cohesion, bigger lift).**
Feasible for this codebase (React 19 + Vite 5), but:
- Tailwind preflight will reset the global CSS; disable it initially or scope
  it, and map the existing tokens to shadcn tokens (`--background`,
  `--foreground`, `--primary`, `--border`, `--radius`).
- shadcn is desktop-first; use `Drawer`/`Sheet` for mobile menus and native
  `<select>` for form controls. Its `Dialog` focus trap/ARIA would fix current
  modal issues.
- Migrate in this order: Settings/forms → modals/sheets → library cards →
  reader chrome. Do not rewrite the reader during the mobile bug-fix phase.
- Estimate: 2–3 focused weeks for a screen-by-screen migration, plus visual
  regression tests.

**C. Mantine or Radix Themes.** Faster than shadcn if the team does not want
Tailwind; batteries included (modals, drawers, notifications, responsive
props), but you inherit their visual language and bundle.

Whichever option: add Storybook and Playwright screenshots for 320/390/768,
light/dark, plus a device checklist. The current repo has **no tests** at all.

---

## 7. Feature backlog (beyond the four requests)

High value:

1. **Bottom tab bar + router/back handling** (fixes several P0s at once).
2. **Reader gestures + zoom + fullscreen + chapter drawer + preloading.**
3. **Offline reading / download-to-device.** The server already downloads
   chapters; add a “download for offline” action, a Capacitor Filesystem cache
   or Cache Storage layer, and an offline indicator. This is the #1 mobile
   expectation for a reader.
4. **Server auth + QR pairing + mDNS discovery.** Required before exposing the
   server beyond a trusted LAN, and makes first-run usable.
5. **Categories management UI** (the API exists; the RN tab was lost).
6. **New chapter notifications:** web push/notify + Discord/ntfy webhook for
   self-hosted users; a daily `node-cron` check already has the data.
7. **Batch selection in the library:** long-press to select, bulk mark read,
   download, add to category, delete.
8. **Duplicate detection/merge** across local/remote sources, preserving
   progress.
9. **Tachiyomi/Mihon backup import/export** and JSON backup/restore.
10. **Reading statistics** (chapters/pages, time, streak).
11. **Page scrubber + chapter list drawer + double-page mode + RTL edge swipe.**
12. **PWA manifest/icons/service worker** for the HTTPS/LAN web deployment.
13. **Accessibility pass** (focus-visible, focus traps, roles, keyboard
    navigation, reduced motion).
14. **Playwright visual regression matrix** and a device checklist.
15. **Multi-user profiles** (a WIP commit exists in history; revisit it with
    per-user progress/tracking).

Nice to have: OPDS feed, collections/reading lists, auto-download new chapters,
image prefetch/data-saver mode, OPDS/Calibre integration, share chapter link,
Apple/Google sign-in (not for a LAN app).

---

## 8. Suggested implementation order

**Sprint 1 — stop the bleeding (P0, ~1 week)**
Settings scroll; reader full-screen/header; queue grid + `00`; Add Manga local
browse; progress/chapter-count API; long-title/chapter-row/setting-row layout;
category dropdown clipping; storage button wrapping; safe-area fallback;
Discover search button + debounce; Add Manga progress feedback.

**Sprint 2 — navigation + gestures (~1.5 weeks)**
Router + bottom tabs + Android back + scroll/state restoration; reader
scroll-snap swipes, edge chapter change, zoom/fullscreen, progress race fix;
landscape breakpoint; iOS input zoom; toast/hover polish; status bar style.

**Sprint 3 — platform + security (~1–2 weeks)**
Server auth/pairing, CORS/CSRF lockdown, plugin install hardening; mDNS/QR;
offline downloads; PWA manifest; categories UI.

**Sprint 4 — tracking sync (~2–3 weeks)**
AniList tracker first (OAuth, link, push/pull, conflict UI), then MAL; nightly
sync and notifications.

**Sprint 5 — design system + tests (~2–3 weeks)**
Radix/shadcn primitives, remove inline styles/duplicated CSS, Storybook,
Playwright matrix, accessibility.

---

## 9. What still needs a real device

- Android edge-to-edge status/navigation bar insets and `SystemBars` style.
- iOS notch/home-indicator safe areas, `contentInset: automatic` interaction,
  keyboard resize and input auto-zoom.
- Pinch zoom, momentum scrolling and scroll-snap behavior in WKWebView/Android
  WebView.
- OAuth redirects for MAL/AniList from the phone.
- Performance with a 500+ chapter / 10k manga library.
