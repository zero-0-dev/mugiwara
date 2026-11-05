# Mugiwara branding

`mugiwara-logo.png` is the original project logo (straw hat + open book over
the "Mugiwara Manga Reader" wordmark), recovered from git history. It was the
icon/splash artwork of the old Expo client and was dropped when the apps were
unified on the shared web UI and Capacitor shell.

- `mugiwara-logo.png` — 1024×1024 master lockup, source of truth.
- `mugiwara-mark.png` — generated symbol-only square (no wordmark), used for
  app icons and the in-app brand mark.

Regenerate every favicon, PWA icon, desktop icon, Android/iOS launcher icon and
splash from the master:

```bash
pnpm brand:assets
```

The generator lives in `scripts/generate-brand-assets.mjs` and writes into
`apps/web/public`, `apps/desktop/buildResources`, and the Capacitor Android/iOS
resource folders. Do not hand-edit generated icons.
