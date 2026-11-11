# Branding

The logo master lives in `assets/branding/mugiwara-logo.png`. All favicons, PWA
icons, desktop icons and Android/iOS launcher icons and splashes are generated
from it:

```sh
pnpm brand:assets
```

See `assets/branding/README.md`. Do not hand-edit generated icons.

## Where the assets go

The generator script is `scripts/generate-brand-assets.mjs`. It produces:

- web favicons, PWA manifest icons and Apple touch icons in `apps/web/public`;
- Electron and installer icons in `apps/desktop/buildResources`;
- Android/iOS launcher icons and splash assets for the Capacitor projects.

Run `pnpm brand:assets` after changing the master logo, then rebuild the
platform you are packaging. Generated icons are build output; change the master
and regenerate instead of editing individual PNGs.
