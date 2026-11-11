# UI system

`apps/web` uses **Tailwind CSS v4** with **shadcn/ui** primitives built on Radix
(`src/components/ui`). The original `--bg-primary`, `--text-primary` and brand
accent tokens are bridged to the shadcn semantic variables in `src/index.css`,
so every theme keeps the same look and feel.

## Themes

Themes live in `src/lib/theme.ts`: each family (Mugiwara, Classic, Catppuccin,
Tokyo Night, Dracula, Synthwave, …) ships a light and a dark variant, and
`applyTheme` writes its tokens to `<html>`. The default is the logo-inspired
**Mugiwara** palette; the previous indigo palette is still available as
**Classic**. Themes are selected in Settings → Appearance.

## Layout and components

- Layout and components use Tailwind utilities; `src/index.css` is limited to
  tokens, base styles and the performance-sensitive reader page layout.
- Dialogs, selects, dropdown menus, tabs, switches and toasts are accessible
  primitives with focus trapping, keyboard navigation and ARIA semantics.
- Mobile-first layouts use a bottom navigation bar, safe-area padding and
  bottom-sheet dialogs. Modals restore focus and close on Escape.
- Use the helpers in `src/lib/utils.ts` (`cn`) and the primitives in
  `src/components/ui` before adding bespoke styles.

## Routing

Navigation is URL-driven with **React Router v7** (data router). Screens are:

| Route                       | Screen             |
| --------------------------- | ------------------ |
| `/`                         | Library            |
| `/manga/:mangaId`           | Manga detail       |
| `/read/:mangaId/:chapterId` | Reader             |
| `/discover`                 | Discover           |
| `/discover/:anilistId`      | Discover detail    |
| `/settings/:tab?`           | Settings           |
| `/disk-space`               | Disk space manager |

Unknown URLs render a not-found screen. Library search, filters and sort live in
query parameters so reloads, back/forward and shared links restore the list.
`App.tsx` resolves the server before routing, which keeps mobile deep links
working. Do not reintroduce in-memory view state; navigate with the router.

The Electron shell registers the `mugiwara://` scheme and loads the matching
route; Capacitor handles `appUrlOpen`/launch URLs after server resolution.

The web build uses an absolute Vite `base` so deep links load `/assets/*`
correctly from the server root. The server already provides the SPA fallback.

## Platform boundaries

Platform-specific behavior belongs in `src/platform/*`:

- `server.ts` — server resolution and token storage.
- `backButton.ts` — Android back button mapping.
- `deepLinks.ts` — app-link resolution.
- `haptics.ts`, `localImport.ts`, `systemBars.ts` — other shell capabilities.

Feature components must not import Capacitor App directly or branch on
`process.platform`, `Platform.OS` or `navigator.platform`.
