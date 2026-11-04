# Reader gestures manual matrix (issue #2)

Run this matrix before changing the reader gesture code. Automated checks cover
the pure mapping helpers (`pnpm --filter @mugiwara-manga/web test`); this table
covers the browser/WebView behavior that unit tests cannot.

## Fixture

- One manga with at least three downloaded chapters.
- The middle chapter has 60+ pages and both a previous and a next chapter.
- Open the middle chapter for swipe tests so both chapter sentinels exist.

## Viewports

| Viewport | Size | Why |
| --- | --- | --- |
| Small phone | 320 x 568 | Narrowest supported CSS width; controls must not overflow |
| Common phone | 390 x 844 | Primary mobile target |
| Landscape | 844 x 390 | Short viewport; controls and page fit |
| Desktop | 1280 x 800 | Tap zones, keyboard, mouse double-click |

## Matrix

| Check | LTR | RTL | Vertical |
| --- | --- | --- | --- |
| Swipe left/right changes exactly one page | swipe left = next | swipe right = next | n/a (vertical scroll) |
| Page indicator matches the settled page | yes | yes | yes |
| Tap left/right edges turn pages in reading direction | left = prev, right = next | left = next, right = prev | any tap toggles controls |
| Center tap shows controls and does not turn a page | yes | yes | yes |
| A tap at the end of a swipe does not turn an extra page | yes | yes | yes |
| Swipe into the "Next chapter" sentinel and release | advances | advances | horizontal swipe at bottom advances |
| Swipe into the "Previous chapter" sentinel and release | goes back | goes back | horizontal swipe at top goes back |
| Progress is written only after the scroll settles | yes | yes | yes |
| Double-tap zooms around the tap point | yes | yes | yes |
| Pinch zooms between 1x and 4x | yes | yes | yes |
| Reset zoom restores fit-to-screen and page tracking | yes | yes | yes |
| Zoomed page does not change the reported page number | yes | yes | yes |
| Header/nav hidden in immersive mode | yes | yes | yes |
| Screen wake lock acquired (supported browsers) | yes | yes | yes |
| Loading spinner appears for the current page | yes | yes | yes |
| Broken page shows a short error, never giant alt text | yes | yes | yes |
| No horizontal document overflow | yes | yes | yes |
| No browser back-swipe from a horizontal turn inside the page | yes | yes | n/a |

## Browser / WebView targets

| Target | Status |
| --- | --- |
| Chromium (desktop/web) | Covered by automated CDP interaction checks and manual matrix |
| Android WebView (Capacitor) | Manual on device; relies on native scroll-snap and overscroll behavior |
| iOS WKWebView (Capacitor) | Manual on device; verify RTL reversed slide order and rubber-banding |
| Safari desktop | Manual; verify `scrollend` fallback (debounced scroll) still settles |
| Firefox | Manual; `scrollend` fallback and scroll-snap |

## Notes

- RTL is implemented by reversing the slide array inside an LTR scroller, so
  `scrollLeft` never relies on WebKit's historical negative-RTL behavior.
- Horizontal edge gestures on Android/iOS are OS-level. `overscroll-behavior:
  contain` prevents in-page chaining and browser overscroll navigation on the
  web; a native edge-back gesture is handled by the Capacitor shell and cannot
  be disabled from CSS.
- Haptics require `@capacitor/haptics` to be synced into the native project
  (`pnpm cap:sync` after adding the dependency). The browser build treats them
  as a no-op.
