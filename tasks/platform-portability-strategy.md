# Platform portability strategy

**Status:** Foundation implemented. See “Implementation status” below.
**Scope:** client architecture (desktop, mobile, web). The Node server stays as-is.

## Implementation status

The first web-first slice is in place:

- `apps/web` is the single React UI, extracted from `apps/desktop/src/renderer`.
  (The longer-term layout in this document calls it `packages/client`; it lives
  in `apps/web` for now so the web build, dev server, and Capacitor `webDir`
  stay in one place.)
- `apps/server` serves the built web client (static + SPA fallback) and binds to
  `0.0.0.0` by default. It prints LAN URLs on startup.
- The Electron shell loads the local server URL (`http://127.0.0.1:<port>`)
  instead of `file://`; `webSecurity: false` is gone; macOS window chrome is a
  single root CSS variable instead of feature-level `.platform-darwin` rules.
- `MUGIWARA_SERVER_URL` makes the desktop shell connect to an existing LAN
  server without starting an embedded one.
- `apps/mobile` is the Capacitor iOS/Android shell. It packages the same web
  build, bundles the UI, asks for the LAN server address at first launch, and
  has cleartext HTTP / ATS configured.
- The web UI has a responsive mobile layout, pointer/tap-zone reader input, and
  same-origin API calls when served by the server.
- The old React Native client has been removed; there is no second UI.

What is still open: the Electron-as-Node packaging improvements from
`dev/osx-build`, optional PWA/service-worker support, and a visual regression
test matrix (Chromium/WebKit/Firefox).

## 1. Executive summary

The portability pain is not caused by the manga-reader features. It is caused by the
rendering layer being implemented twice, and by OS/window/packaging concerns leaking
into application components.

The repo already has the right shape for a single client:

- `apps/server` owns all domain logic: library, chapters, plugins, storage, queue,
  discovery, SQLite, file/archive access.
- The clients are thin HTTP clients. They mostly render JSON and images.

So the goal is achievable: **one UI codebase, several thin shells**. The shells should
only expose capabilities (file dialog, window chrome, notifications, version), never
contain a second UI.

**Recommendation:** make the web client the single source of truth.

1. Move the desktop renderer into a shared `packages/client` React web app.
2. Serve that app from the existing Node server (same origin as the API).
3. Desktop: keep Electron as a thin shell, but load the server URL instead of a local
   `index.html`, and move all macOS/Windows/Linux window handling into the shell.
4. Mobile: use the same web build inside a Capacitor shell. Add a PWA manifest/service
   worker as well, for deployments where the server is reachable over HTTPS. Capacitor
   is a packaging target, not a second UI.
5. ~~Retire `apps/mobile` (React Native) and the desktop renderer once the shared client
   reaches parity.~~ Done: the React Native client and the desktop renderer were removed.

If native mobile UI quality is a hard requirement, the alternative is **Expo/React
Native everywhere** (RN on mobile, React Native Web in Electron). If *pixel-identical
rendering on every platform* is the hard requirement, the only mainstream option is
**Flutter**, at the cost of rewriting the entire client.

Do **not** move to Tauri to solve this problem. Tauri uses the OS webview (WKWebView on
macOS/iOS, WebView2/Chromium on Windows, WebKitGTK on Linux, Android WebView). That
increases the number of rendering engines and reproduces exactly the bug class you are
trying to remove.

## 2. What the codebase shows

### Two complete clients

| | Desktop | Mobile |
|---|---|---|
| UI | React DOM, ~30 files, 3,280-line CSS | React Native, ~36 files, StyleSheet |
| Runtime | Electron 28 + Chromium | Expo 54 / RN 0.81 (native iOS/Android) |
| Reader | `Reader.tsx` (DOM img, scrollIntoView) | `HorizontalReader.tsx` + `VerticalReader.tsx` (FlatList, PanResponder) |
| API client | `renderer/api/client.ts` + hooks | `api/client.ts` + hooks |
| Types | partly `@mugiwara-manga/types` | own copy in `apps/mobile/types/index.ts` |
| Storage | server only | AsyncStorage for server URL |
| Platform code | `.platform-darwin` CSS, `process.platform`, `titleBarStyle: hiddenInset` | `Platform.select`, `android_ripple`, safe-area insets |

Every feature added to the client has to be built twice, in two rendering models, with
two readers. That is the main source of long-term maintenance and divergence.

### The server is already portable

`apps/server` has no UI. Its platform-specific parts are native npm modules
(`better-sqlite3`, `sharp`) and filesystem paths. Those are packaging concerns, not UI
concerns. It also does not serve the web client yet, so a web/PWA build has to be added
to it (or served by a static host).

### The macOS work is a symptom, not a browser bug

Current `main` contains:

- `.platform-darwin .app-header { padding-left: 6rem }`
- `.platform-darwin .top-controls { padding-left: 6rem }`
- a `platform` value exposed from preload and a `platform-darwin` class on `<body>`
- `titleBarStyle: "hiddenInset"` in `BrowserWindow`
- `webSecurity: false` to load local images

The branch `origin/dev/osx-build` adds more platform work:

- Electron 33 (from 28)
- `app.disableHardwareAcceleration()` "to prevent crashes on macOS"
- `ELECTRON_RUN_AS_NODE` to spawn the server
- `@electron/rebuild` for `better-sqlite3`
- single-instance lock and server log files

This is a mix of three different problems:

1. **OS window chrome** (traffic lights, titlebar inset, safe areas).
2. **Packaging/native ABI** (better-sqlite3, sharp, Electron rebuild, signing).
3. **Rendering engine differences** (only if the app runs in Safari/WebKit or a system
   webview).

Electron bundles Chromium, so on macOS the renderer engine is *not* Safari. The
`padding-left: 6rem` hack is window chrome, not a Chromium/CSS portability problem. It
should live in the shell/root layout, not in feature CSS and not as a `.platform-darwin`
class sprinkled through components.

Also, `webSecurity: false` is a security regression. The server already serves images
over HTTP; the desktop app should load pages from that HTTP origin instead of disabling
web security for `file://`.

## 3. What "single source" can and cannot mean

There is no single runtime on all six targets unless you ship your own renderer:

- **iOS**: every browser and every in-app webview is WebKit. Apple does not allow another
  engine in practice. A PWA/Capacitor app on iOS is WebKit.
- **Android**: WebView is Chromium-based.
- **Desktop**: you choose. Electron = bundled Chromium (consistent). Tauri/system webview
  = WKWebView / WebView2 / WebKitGTK (three engines).
- **Flutter**: ships its own renderer (Impeller/Skia) on every target, so it is the only
  mainstream way to get the *same renderer* everywhere. That is also why it needs a full
  rewrite and why Flutter Web has different tradeoffs.

So "one source" realistically means **one UI codebase**, not **one rendering engine**.
The architecture should minimize the number of engines and isolate the remaining
differences in a shell/capability layer.

## 4. Options

### A. Web-first: one responsive React app + PWA + thin Electron/Capacitor shells

**Recommended.**

- One React/Vite app, one design system, one reader, one API client.
- Server serves the app and the API from the same origin.
- Desktop: Electron loads `http://127.0.0.1:<port>` (the embedded server). Chromium is
  identical on macOS/Windows/Linux, so desktop UI is consistent. The shell handles
  traffic lights, window controls, dialogs, updates.
- Mobile: the same build in Capacitor (iOS WKWebView, Android Chromium WebView). Add
  PWA manifest/service worker for HTTPS deployments.
- Offline: service worker for the app shell and recently read pages; the server remains
  the source of truth for the library. `navigator.storage.persist()` where available.

**Pros**

- One UI codebase for all targets.
- Keeps the existing server and the existing desktop React UI as the starting point.
- Desktop gets one rendering engine across all three OSes (unlike Tauri).
- Web/PWA is the cheapest distribution path: no signing/notarization for macOS, no app
  store review, instant updates.
- Web is the best platform for accessibility, text, deep links, and debugging.
- The reader is image-heavy but not effect-heavy; CSS scroll-snap, IntersectionObserver,
  native pinch zoom and `loading="lazy"` are enough. The WebView performance ceiling is
  acceptable for this app because the server does the heavy work.

**Cons**

- Mobile UI must become responsive; the native RN reader/gestures are lost.
- Two webview engines remain on mobile (WebKit/Chromium). They must be tested, but the
  surface is small and testable in Safari + Chrome.
- PWA on iOS requires HTTPS for service workers (plain LAN HTTP will not work except
  localhost). For a local HTTP server, Capacitor is the practical mobile shell.
- iOS PWA limits: no background sync, push only in Home Screen apps, manual install,
  storage can be evicted under pressure, no public File System Access API. None of these
  are core to a server-backed manga reader, but they rule out "PWA as the only mobile
  distribution" for some users.
- Electron is large (~100 MB+ installed) and needs per-platform packaging.

**Best fit:** the stated goal (single code, simple features, okay with PWA) and the
existing codebase.

### B. Expo/React Native universal: RN mobile + React Native Web + Electron

- Keep the current Expo app as the single UI.
- Mobile stays native (best gesture/scroll/120 Hz behavior).
- Web and desktop use `react-native-web`; Electron loads the Expo web export.
- `apps/desktop` renderer is retired, or kept temporarily.

**Pros**

- Maximum reuse of the existing mobile app.
- Native mobile performance and app-store distribution.
- One component model and one set of screens.
- Expo SDK 56 (2026) has first-class web support; react-native-web is actively
  maintained again.

**Cons**

- Desktop becomes React Native Web in Electron. It works, but it is a web app with RN
  layout constraints, not a desktop-optimized UI.
- RN Web is a third behavior to test (native iOS, native Android, DOM).
- Desktop tooling is immature: Expo Desktop v1 is an independent, unofficial project;
  React Native macOS/Windows lag React Native releases and have a tiny ecosystem.
- `.web.tsx` / `.ios.tsx` overrides will appear for keyboard, hover, right-click,
  file dialogs, and window chrome. That is a smaller branch surface than two UIs, but it
  is not zero.
- PWA/offline still needs a service worker; Expo web can provide the build, but the
  offline layer is separate work.

**Best fit:** native mobile feel and app-store presence are non-negotiable, and desktop
can accept a web UI.

### C. Flutter

- Rewrite the client in Dart. Keep the Node server unchanged.
- One renderer (Impeller) on iOS/Android/macOS/Windows/Linux; web uses CanvasKit/Skwasm.

**Pros**

- The strongest answer to "no browser engine differences": pixel-identical UI and
  animation everywhere.
- Excellent image-heavy scrolling, gestures, page transitions, and 120 Hz behavior.
- Desktop support is stable; Impeller is default on desktop as of Flutter 3.47 (2026).
- One codebase for all six targets; native compilation on mobile/desktop.

**Cons**

- Full client rewrite (~all UI + reader + platform plugins), in a different language and
  ecosystem from the server.
- Flutter Web is not DOM-based: larger initial payload, weaker text selection,
  accessibility, SEO, and browser integration. It is fine for an app, not for a content
  site. Wasm is the direction but not yet the default.
- Desktop plugin ecosystem is smaller than Electron/Node; window chrome, file dialogs,
  tray, updates, and signing still need per-platform work (but not per-platform UI).
- Two languages in the repo (Dart client, TypeScript server) and a smaller hiring pool.

**Best fit:** you are willing to invest in a rewrite to get the highest consistency and
native performance, and web is a secondary target.

### D. Tauri 2 (or Wails/Neutralino)

**Rejected for this goal.**

- macOS/iOS: WKWebView (WebKit).
- Windows: WebView2 (Chromium).
- Linux: WebKitGTK (WebKit, distro-version dependent).
- Android: Android WebView (Chromium).
- Result: 3–4 rendering engines, plus OS-version-dependent webview versions. This is the
  exact class of bug you want to eliminate.
- The wins are installer size and memory, not UI consistency. A 2026 write-up from a Tauri
  developer explicitly lists macOS titlebar padding differences and Linux WebKitGTK
  font-rendering patches as the cost of system webviews.

**Best fit:** small utilities where binary size matters more than pixel consistency.

### E. Capacitor alone

- Not a full architecture; it is the mobile packaging layer for option A.
- Capacitor 8 (Dec 2025): iOS 16+, Android 8+, Node 22+; iOS SPM by default; Android
  edge-to-edge/SystemBars support.
- The community Electron platform (`@capacitor-community/electron`) is unmaintained
  (last release 2023, pinned to old Capacitor/Electron). Use a small Electron shell
  instead, not that package.
- Same web build can be a PWA and a store app; no UI fork.

### F. Compose Multiplatform / .NET MAUI / Qt

- Single-renderer or native-ish, but smaller ecosystems, weaker web stories, and a full
  rewrite. Not justified for a manga reader with an existing React/Node codebase.

### G. Status quo + more platform branches

- Two UIs, two readers, two API clients, two sets of types, two release pipelines.
- Every new feature is implemented twice; every platform bug is fixed twice or fixed in
  one client only.
- This is the option the user explicitly wants to avoid.

## 5. Comparison

| | Codebases | Rendering engines | Mobile UX | Desktop consistency | Web/PWA | Rewrite | Maintenance |
|---|---|---|---|---|---|---|---|
| **A. Web-first + Electron/Capacitor** | 1 UI | Chromium (desktop/Android), WebKit (iOS) | Good | Excellent (same Chromium) | Native | Medium | **Lowest** |
| **B. Expo universal** | 1 UI | Native iOS/Android, DOM on web/desktop | **Best** | Good (Chromium in Electron) | Via RN Web | Medium | Low/medium |
| **C. Flutter** | 1 UI | **Own engine everywhere** | **Best** | **Excellent** | Wasm/CanvasKit | **High** | Medium |
| **D. Tauri** | 1 UI | WKWebView, WebView2, WebKitGTK, Android WebView | Good | **Poor** | Yes | Medium | High (platform CSS) |
| **G. Status quo** | 2 UIs | Chromium + native + possible WebKit | Good | Good | No | Low now | **Highest** |

## 6. Recommended target architecture

```
apps/
  server/                 Node + Express + SQLite + plugins + queue
    src/web/              built client assets (served by Express)
  desktop/                Electron shell only
    src/main/             window, server lifecycle, dialogs, updates
    src/preload/          typed capability bridge
  mobile-shell/           optional Capacitor 8 shell (same web build)
packages/
  client/                 THE UI: React + Vite + TanStack Query
    src/app/              routes / navigation
    src/features/         library, discover, detail, reader, settings
    src/reader/           paged, vertical, double-page; CSS scroll-snap
    src/design/           tokens, primitives, responsive layouts
    src/platform/         capability interface + web/electron/capacitor adapters
  api-client/             shared API client (no React)
  shared/                 shared domain types
```

### Single origin

Serve the built client from Express:

```ts
app.use(express.static(join(__dirname, "web")));
```

Add a SPA fallback so deep links work:

```ts
app.use(express.static(join(__dirname, "web")));
app.get("*", (_req, res) => res.sendFile(join(__dirname, "web/index.html")));
```

Then the desktop shell loads `http://127.0.0.1:<port>` and the mobile shell loads the
same URL (or a bundled `capacitor://localhost` build). Benefits:

- No CORS.
- No `getApiUrl`/port plumbing in the renderer.
- PWA service worker and API share one origin.
- Relative asset paths work in Electron, Capacitor, and the browser.
- Images can stay behind the server's HTTP routes; no `webSecurity: false`.

### Platform adaptation contract

Define one capability interface and inject it at the root:

```ts
interface Shell {
  kind: "web" | "electron" | "capacitor";
  openFolder(path: string): Promise<void>;
  selectFolder(): Promise<string | null>;
  notify(title: string, body: string): Promise<void>;
  setWindowChrome?(inset: { top: number; left: number }): void;
  getVersion(): Promise<string>;
}
```

Rules:

- Feature components never read `process.platform`, `navigator.platform`, or
  `window.electronAPI` directly.
- Window chrome, safe areas, and titlebar insets are the shell's job. Expose them as CSS
  variables (`--titlebar-inset-left`, `--safe-area-top`) at the root.
- Capability differences are `if (shell.kind === ...)` at one call site, with a web
  fallback. Not parallel components.
- Prefer standard web APIs (`showDirectoryPicker`, `navigator.share`, `Notification`,
  `navigator.wakeLock`) and let the shell fill gaps.

### macOS window chrome, concretely

The current padding hack is replaceable with Electron's supported APIs:

```ts
new BrowserWindow({
  titleBarStyle: "hidden",
  trafficLightPosition: { x: 12, y: 12 },
  // or titleBarStyle: "hiddenInset" for the standard inset
});
```

On platforms where Window Controls Overlay is active (`titleBarOverlay`), Electron exposes
the window-controls safe area to CSS. Where it is not, set one CSS variable from the shell
using the real control position. Either way, the inset is a shell concern, not a
hard-coded `6rem` in component CSS:

```css
.app-titlebar {
  padding-left: max(env(titlebar-area-x, 0px), var(--titlebar-inset-left, 0px));
  width: env(titlebar-area-width, 100%);
  -webkit-app-region: drag;
}
.app-titlebar button,
.app-titlebar select,
.app-titlebar input {
  -webkit-app-region: no-drag;
}
```

If the custom titlebar is not worth the complexity, use the default macOS titlebar and
remove all inset code. The important part is that the fix is one shell concern, not a
`platform-darwin` class used by reader and header components.

### Reader on the web

The reader is the only performance-sensitive screen; design it with web-native primitives:

- **Paged LTR/RTL:** horizontal scroll container with `scroll-snap-type: x mandatory`,
  `scroll-snap-align: center`, and `dir="rtl"` or reversed flex order for RTL. This uses
  compositor scrolling, not a JS animation loop.
- **Vertical/webtoon:** normal vertical scroll, images `width: 100%`, known
  `aspect-ratio` from the API to avoid layout shift, `content-visibility: auto` for long
  chapters.
- **Progress:** `IntersectionObserver` on page elements; debounce writes to the API.
- **Preload:** keep a window of N pages (`new Image()` or `<link rel="preload">`).
- **Gestures:** pointer events for tap zones; native pinch zoom; `overscroll-behavior`
  to avoid browser back-swipe conflicts at chapter edges.
- **Fullscreen/wake lock:** `requestFullscreen()` and `navigator.wakeLock.request("screen")`
  (Safari 16.4+; installed PWA from 18.4).
- **No JS-driven page-turn animation loops.** Some WebViews cap `requestAnimationFrame`
  near 60 Hz on 120 Hz displays; CSS scroll/transform still runs smoothly. This is a
  reported WebKit limitation, not a blocker for a reader.

## 7. PWA notes (important for this app)

A PWA is a great fit for the *UI*, but it has deployment constraints:

- **Secure context:** service workers and installability require HTTPS or localhost. A
  phone connecting to `http://192.168.x.x:3001` will not get a service worker. If the
  server is local-only over HTTP, use the Capacitor shell; if you can put the server
  behind HTTPS (Tailscale, Caddy, Cloudflare Tunnel, NAS reverse proxy), the PWA works.
- **iOS install:** manual Share → Add to Home Screen. No automatic install prompt.
- **iOS push:** only in Home Screen web apps, requires a user gesture, and every push
  must show a notification (no silent background refresh). Not needed for a reader.
- **iOS background:** no Background Sync/Periodic Sync. Refresh on launch and on
  `online`; do not rely on background sync.
- **iOS storage:** can be evicted under pressure; call `navigator.storage.persist()` and
  design for a cache miss. The library itself lives on the server, so this is only the
  offline cache.
- **Offline reading:** cache the app shell + downloaded pages in Cache Storage/OPFS.
  The server can expose a "download chapter" endpoint and the client can cache images.
  Do not try to mirror the whole library into browser storage.

For a server-backed manga reader, these are acceptable. The PWA is a distribution and
offline convenience, not the source of truth.

## 8. Migration plan

### Phase 0 — stop the bleeding (1–2 days)

- Upgrade Electron 28 → 44/45 (28 is EOL; only the latest three majors get fixes).
- Remove `webSecurity: false`; load the renderer from the local server origin.
- Replace the `.platform-darwin` padding hacks with `trafficLightPosition` +
  `env(titlebar-area-*)` / a root CSS variable, or revert to the default titlebar.
- Re-test macOS window chrome, reader controls, and the server child process.
- Do not ship `app.disableHardwareAcceleration()` as a default workaround; diagnose the
  crash on a current Electron first.

This alone fixes the specific macOS issues without an architecture change.

### Phase 1 — extract the shared client (1–2 weeks)

- Move `apps/desktop/src/renderer` into `packages/client`.
- Replace ad-hoc view state (`currentView` union) with a router (React Router or
  TanStack Router). This makes the desktop, web, and mobile shells use the same URLs.
- Move the API client into `packages/api-client`; delete the duplicate mobile types and
  point the mobile app at `@mugiwara-manga/types` while it still exists.
- Add a responsive app shell: desktop side nav, mobile bottom tabs, reader full-screen.
- Serve the Vite build from Express; load it from Electron.
- Verify in Chromium and WebKit (Safari/Playwright) as part of CI.

### Phase 2 — PWA + mobile parity (1–2 weeks)

- Add `manifest.webmanifest`, icons, theme color, `display: standalone`,
  `viewport-fit=cover`, safe-area CSS.
- Add a service worker (Vite PWA plugin or Workbox): app shell precache, runtime cache
  for images, offline fallback. Request persistent storage.
- Do a mobile pass: touch targets, bottom navigation, reader tap zones, pinch zoom,
  `overscroll-behavior`, back gesture conflicts.
- Add install instructions for iOS (Share → Add to Home Screen).

### Phase 3 — shells and cleanup (done)

- Capacitor 8 shell in `apps/mobile` for iOS/Android. The web build is copied in
  unchanged.
- The React Native client and the old desktop renderer are removed.
- One release pipeline: build client → build server → package shells.

### Phase 4 — guardrails

- Playwright visual regression matrix: Chromium, WebKit, Firefox; desktop and mobile
  viewports; reader in LTR/RTL/vertical.
- A device checklist: macOS Electron, Windows Electron, Linux Electron, iPhone Safari +
  installed PWA, Android Chrome + installed PWA.
- A rule in review: no `process.platform` / `Platform.OS` / `navigator.platform` in
  feature code. Platform checks only in `packages/client/src/platform/*` and shells.

## 9. Effort estimate

- **Option A (recommended):** ~3–5 weeks for one developer, because the desktop React
  UI and server already exist. Most work is responsive layout, the reader CSS, PWA, and
  shell cleanup.
- **Option B (Expo universal):** ~3–6 weeks, mostly desktop React Native Web adaptation
  and platform overrides.
- **Option C (Flutter):** ~6–10+ weeks, full client rewrite plus platform plugins.
- **Option D (Tauri):** ~3–5 weeks, then ongoing platform webview patches. Not
  recommended for the stated goal.

## 10. Decision guide

- **Want the least maintenance and a single UI, okay with a web-based mobile app?**
  → Option A.
- **Native mobile feel and app-store presence are non-negotiable, desktop can be web?**
  → Option B.
- **Pixel-identical UI and native performance everywhere, willing to rewrite in Dart?**
  → Option C.
- **Mainly want a smaller desktop binary?**
  → Option D, but accept more platform rendering differences.

## 11. Sources

- Electron releases / support policy: <https://releases.electronjs.org/release>,
  <https://www.electronjs.org/docs/latest/tutorial/electron-timelines>
- Electron custom title bar and `env(titlebar-area-*)`:
  <https://www.electronjs.org/docs/latest/tutorial/custom-title-bar>
- Tauri webview versions (WKWebView / WebView2 / WebKitGTK / Android WebView):
  <https://v2.tauri.app/reference/webview-versions/>
- Capacitor 8 announcement and requirements: <https://ionic.io/blog/announcing-capacitor-8>,
  <https://capacitorjs.com/docs/updating/8-0>
- Capacitor platforms and PWA: <https://capacitorjs.com/docs/next/getting-started/faqs>
- Expo web: <https://docs.expo.dev/workflow/web/>
- Expo SDK 56: <https://expo.dev/changelog/sdk-56>
- React Native Web maintenance: <https://github.com/necolas/react-native-web/discussions/2872>
- Flutter supported platforms: <https://docs.flutter.dev/reference/supported-platforms>
- Flutter Impeller (desktop default, web renderer): <https://docs.flutter.dev/perf/impeller>
- Flutter 2026 roadmap: <https://flutter.dev/blog/flutter-darts-2026-roadmap>
- iOS PWA capability matrix: <https://firt.dev/notes/pwa-ios/>
- PWA storage/quotas/background limits: <https://progressivewebapps.com/reference/api-cheatsheet/>
- WebKit rAF/ProMotion limitation (background):
  <https://fluttercook.github.io/blog/web-tech-to-mobile-app-2026/>
