# Mugiwara documentation

Mugiwara is a self-hosted manga reader with one shared UI for the browser,
desktop and mobile. The [project README](../README.md) is the short version;
this directory holds the detailed guides.

## Start here

- [Getting started](getting-started.md) — install, run, and put a server on
  your LAN.
- [Architecture](architecture.md) — how the server, web client, Electron shell
  and Capacitor shell fit together.
- [Development](development.md) — tests, gating checks, builds and release
  commands.

## Features and operations

- [Authentication and security](authentication.md) — pairing, bearer tokens,
  content tokens, environment variables, CORS/CSRF and rate limits.
- [Library and progress](library.md) — chapter counts, reading status and
  progress storage.
- [Plugins](plugins.md) — source and storage plugins and plugin-install
  hardening.
- [Tracker sync](tracking.md) — AniList and MyAnimeList setup, conflict policy
  and mappings.
- [UI system](ui.md) — themes, routing, Tailwind/shadcn conventions.

## Platform guides

- [Desktop](desktop.md) — Electron development and packaging.
- [Mobile](mobile.md) — Capacitor, Android APKs and iOS builds.
- [Branding](branding.md) — the logo master and generated icons.

## Project policies

- [Contributing](../CONTRIBUTING.md)
- [License](../LICENSE) (GPL-3.0-or-later)
