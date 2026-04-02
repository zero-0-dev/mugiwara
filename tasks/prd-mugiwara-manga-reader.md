# PRD: Mugiwara Manga Reader

## Introduction

Mugiwara is a cross-platform manga reader application designed for manga enthusiasts who want a unified, seamless reading experience across all their devices. The application consists of a local server component that organizes manga files and provides a plugin-based extensible architecture for fetching content from various sources, paired with cross-platform clients (mobile, web, desktop) that offer a minimalist, distraction-free reading experience.

The server maintains a local SQLite database for tracking manga metadata, reading progress, and library organization, while the clients provide intuitive interfaces optimized for each platform.

## Goals

- Build a cross-platform manga reader (iOS, Android, Web, macOS, Windows, Linux)
- Create an extensible server architecture supporting plugins for multiple manga sources
- Provide seamless reading progress synchronization across all devices
- Deliver a minimalist, distraction-free reading experience optimized for manga
- Support all common manga image formats (CBZ, CBR, ZIP, folder of images)
- Enable library organization with categories, filters, and collections
- Integrate with third-party tracking services (MyAnimeList, AniList)
- Implement notification system for new chapter releases
- Maintain high performance even with large libraries (1000+ manga)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MONOREPO STRUCTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          TURBOREPO ROOT                              │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  apps/                                                               │   │
│  │  ├── server/          # Node.js/Express API server                   │   │
│  │  │   ├── src/        # API, plugins, database, services, jobs       │   │
│  │  │   └── package.json                                               │   │
│  │  ├── mobile/        # React Native (iOS/Android)                    │   │
│  │  │   ├── src/        # Screens, components, navigation, store       │   │
│  │  │   └── package.json                                               │   │
│  │  ├── web/           # React Native Web (Browser)                    │   │
│  │  │   ├── src/        # Uses @mugiwara/ui components                 │   │
│  │  │   └── package.json                                               │   │
│  │  └── desktop/       # Electron + React                              │   │
│  │      ├── src/        # Main, renderer processes                     │   │
│  │      └── package.json                                               │   │
│  │                                                                      │   │
│  │  packages/                                                         │   │
│  │  ├── ui/            # Shared React Native components                │   │
│  │  ├── shared/        # Types, API client, store logic, utils         │   │
│  │  ├── config/        # Shared ESLint, TS, Tailwind configs           │   │
│  │  └── ts-config/     # Shared TypeScript configurations              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Server
- **Runtime**: Node.js 20+
- **Framework**: Express.js with TypeScript
- **Database**: SQLite (better-sqlite3) with migrations
- **File Processing**: node-stream-zip, sharp (image processing)
- **Task Scheduler**: node-cron for background jobs

### Clients
- **Mobile**: React Native 0.73+ with Expo
- **Web**: React Native Web + Vite
- **Desktop**: Electron 28+ with React
- **UI Framework**: Tailwind CSS + NativeWind (for RN)
- **State Management**: Zustand
- **API Client**: Axios with React Query

### Shared
- **Monorepo**: Turborepo
- **Package Manager**: pnpm
- **Linting**: ESLint + Prettier
- **Types**: TypeScript 5.3+

## Database Schema

### Core Tables

#### manga
- id: TEXT PRIMARY KEY
- title: TEXT NOT NULL
- alt_titles: TEXT (JSON array)
- description: TEXT
- author: TEXT
- artist: TEXT
- status: TEXT (ongoing, completed, hiatus, cancelled)
- media_type: TEXT (manga, manhwa, manhua, webtoon)
- cover_image: TEXT
- source_id: TEXT (plugin source identifier)
- source_manga_id: TEXT (id from source)
- created_at: DATETIME
- updated_at: DATETIME

#### chapters
- id: TEXT PRIMARY KEY
- manga_id: TEXT REFERENCES manga
- chapter_number: REAL
- title: TEXT
- pages_count: INTEGER
- file_path: TEXT (local file or URL)
- archive_type: TEXT (cbz, cbr, zip, folder)
- published_at: DATETIME
- created_at: DATETIME

#### reading_progress
- id: TEXT PRIMARY KEY
- manga_id: TEXT REFERENCES manga
- chapter_id: TEXT REFERENCES chapters
- page_number: INTEGER (default 1)
- total_pages: INTEGER
- percent_complete: REAL
- is_completed: BOOLEAN
- last_read_at: DATETIME
- device_id: TEXT

#### categories
- id: TEXT PRIMARY KEY
- name: TEXT NOT NULL
- color: TEXT
- sort_order: INTEGER
- created_at: DATETIME

#### manga_categories (junction table)
- manga_id: TEXT
- category_id: TEXT

#### collections
- id: TEXT PRIMARY KEY
- name: TEXT NOT NULL
- description: TEXT
- cover_image: TEXT
- sort_order: INTEGER
- created_at: DATETIME

#### manga_collections (junction table)
- manga_id: TEXT
- collection_id: TEXT
- sort_order: INTEGER
- added_at: DATETIME

#### tracking
- id: TEXT PRIMARY KEY
- manga_id: TEXT REFERENCES manga
- tracker_type: TEXT (myanimelist, anilist, kitsu)
- tracker_manga_id: TEXT
- status: TEXT (reading, completed, on_hold, dropped, plan_to_read)
- score: INTEGER
- chapters_read: INTEGER
- started_at: DATE
- finished_at: DATE
- last_synced_at: DATETIME


## User Stories

### MVP Phase 1: Core Reading Experience

#### US-001: Server Setup with SQLite Database
**Description:** As a developer, I need a robust server with SQLite database to store manga metadata and reading progress.

**Acceptance Criteria:**
- [ ] Set up Express.js server with TypeScript
- [ ] Configure SQLite with migrations using better-sqlite3
- [ ] Create database schema for manga, chapters, reading progress, and categories
- [ ] Implement REST API endpoints for CRUD operations
- [ ] Add file system watcher for monitoring manga directories
- [ ] Support CBZ, CBR, ZIP archives and image folders
- [ ] Typecheck and lint passes

#### US-002: Local File Source Plugin
**Description:** As a user, I want the server to scan my local manga directories so I can read files from disk.

**Acceptance Criteria:**
- [ ] Create plugin interface for manga sources
- [ ] Implement local filesystem plugin
- [ ] Scan configured directories recursively
- [ ] Extract manga metadata from folder/file names
- [ ] Generate thumbnails for manga covers
- [ ] Update library automatically when files change
- [ ] Support nested folder structures (Manga/Chapter/Page.jpg)

#### US-003: React Native Mobile Client
**Description:** As a mobile user, I want a native iOS/Android app to read manga on my phone/tablet.

**Acceptance Criteria:**
- [ ] Set up React Native project with TypeScript
- [ ] Configure navigation (React Navigation)
- [ ] Implement connection to server via API
- [ ] Build library screen with grid/list view
- [ ] Implement manga detail screen
- [ ] Create reading screen with gesture controls
- [ ] Typecheck and lint passes
- [ ] Test on both iOS and Android simulators

#### US-004: Web Client with React Native Web
**Description:** As a user, I want to access my manga library from any web browser.

**Acceptance Criteria:**
- [ ] Set up React Native Web project
- [ ] Share UI components with mobile via @mugiwara/ui package
- [ ] Implement responsive design for desktop/tablet/mobile browsers
- [ ] Add PWA support for offline reading capability
- [ ] Configure webpack/vite for bundling
- [ ] Typecheck and lint passes
- [ ] Verify in Chrome, Firefox, Safari

#### US-005: Desktop Client with Electron
**Description:** As a desktop user, I want a native desktop app with keyboard shortcuts and system integration.

**Acceptance Criteria:**
- [ ] Set up Electron project with TypeScript
- [ ] Configure main and renderer processes
- [ ] Implement window management (minimize to tray, etc.)
- [ ] Add global keyboard shortcuts (next/prev chapter, fullscreen)
- [ ] Create desktop-optimized UI with @mugiwara/desktop-ui
- [ ] Add drag-and-drop support for importing manga
- [ ] Typecheck and lint passes
- [ ] Test on macOS, Windows, and Linux

#### US-006: Reading Screen with Configurable Layout
**Description:** As a reader, I want configurable reading modes (RTL, vertical, etc.) based on manga type.

**Acceptance Criteria:**
- [ ] Implement manga media type field (manga, manhwa, manhua, webtoon)
- [ ] Create reading mode selector (RTL, LTR, vertical scroll, webtoon)
- [ ] Set defaults per media type (manga=RTL, webtoon=vertical)
- [ ] Implement RTL reading with tap/swipe navigation
- [ ] Implement vertical scroll for webtoons/manhwa
- [ ] Add pinch-to-zoom on mobile
- [ ] Add fit-to-width/fit-to-height options
- [ ] Remember reading mode preference per manga
- [ ] Typecheck and lint passes
- [ ] Verify on mobile, web, and desktop

#### US-007: Reading Progress Tracking
**Description:** As a reader, I want the app to remember where I left off in each manga.

**Acceptance Criteria:**
- [ ] Save progress every time page changes
- [ ] Track current chapter and page number
- [ ] Calculate percent complete for each manga
- [ ] Display progress indicators in library (badges/progress bars)
- [ ] Sync progress across devices via server
- [ ] Show "Continue Reading" section on home screen
- [ ] Handle edge cases (deleted chapters, reorganized files)
- [ ] Typecheck and lint passes

### Phase 2: Library Management & Discovery

#### US-008: Library Organization with Categories
**Description:** As a user, I want to organize my manga into categories.

**Acceptance Criteria:**
- [ ] Create, edit, delete custom categories
- [ ] Assign multiple categories to a manga
- [ ] Filter library by category
- [ ] Sort categories (alphabetical, custom order)
- [ ] Display category counts
- [ ] Quick-add to category from manga detail
- [ ] Typecheck and lint passes
- [ ] Verify in browser

#### US-009: Collections (Playlists)
**Description:** As a user, I want to create collections for organizing reading lists.

**Acceptance Criteria:**
- [ ] Create named collections (e.g., "Summer Reading", "Completed")
- [ ] Add/remove manga from collections
- [ ] Reorder manga within collection
- [ ] Set custom cover image for collection
- [ ] Display collections on home screen
- [ ] Share collections (export/import JSON)
- [ ] Typecheck and lint passes
- [ ] Verify in browser

#### US-010: Search and Filter System
**Description:** As a user, I want to search and filter my library effectively.

**Acceptance Criteria:**
- [ ] Full-text search across titles, descriptions, authors
- [ ] Filter by status (reading, completed, on-hold, etc.)
- [ ] Filter by media type (manga, manhwa, etc.)
- [ ] Filter by category
- [ ] Combined filters (status + category + search)
- [ ] Sort by various criteria (title, last read, date added, progress)
- [ ] Save filter presets
- [ ] Typecheck and lint passes
- [ ] Verify in browser

#### US-011: Automatic Metadata Fetching
**Description:** As a user, I want the app to automatically fetch manga metadata from online sources.

**Acceptance Criteria:**
- [ ] Integrate with AniList API for metadata
- [ ] Search by title and select correct match
- [ ] Auto-fetch cover images, descriptions, tags
- [ ] Update metadata periodically (check for new chapters)
- [ ] Store fetched metadata locally
- [ ] Allow manual override of auto-fetched data
- [ ] Typecheck and lint passes
- [ ] Test with various manga titles

#### US-012: Plugin Architecture for External Sources
**Description:** As a developer, I want an extensible plugin system for adding manga sources.

**Acceptance Criteria:**
- [ ] Define plugin interface (search, fetch manga, fetch chapters)
- [ ] Create plugin registry and loader
- [ ] Implement example plugin (local filesystem)
- [ ] Add plugin configuration UI
- [ ] Enable/disable plugins dynamically
- [ ] Document plugin development guide
- [ ] Typecheck and lint passes


### Phase 3: Advanced Features

#### US-013: Third-Party Tracking Integration (MyAnimeList, AniList)
**Description:** As a user, I want to sync my reading progress with MyAnimeList or AniList.

**Acceptance Criteria:**
- [ ] OAuth authentication with MyAnimeList
- [ ] OAuth authentication with AniList
- [ ] Auto-link manga to tracker entries
- [ ] Sync reading status (reading, completed, dropped, etc.)
- [ ] Sync chapter progress
- [ ] Two-way sync (update tracker from app, update app from tracker)
- [ ] Manual sync trigger + auto-sync on progress change
- [ ] Handle conflicts gracefully
- [ ] Typecheck and lint passes

#### US-014: New Chapter Notifications
**Description:** As a user, I want to be notified when new chapters are available for manga in my library.

**Acceptance Criteria:**
- [ ] Background job to check for new chapters
- [ ] Compare against existing chapters in database
- [ ] Push notifications for mobile
- [ ] Desktop notifications for Electron
- [ ] Web notification support (with user permission)
- [ ] Notification settings (enable/disable per manga, global toggle)
- [ ] "New Chapters" badge on library tab
- [ ] Typecheck and lint passes

#### US-015: Progress Sync Across Devices
**Description:** As a user with multiple devices, I want my reading progress to sync seamlessly.

**Acceptance Criteria:**
- [ ] Server API for progress sync
- [ ] Device identification and registration
- [ ] Real-time sync via WebSocket (optional) or polling
- [ ] Conflict resolution (latest timestamp wins)
- [ ] Offline support (queue sync when back online)
- [ ] Show which device last updated progress
- [ ] Typecheck and lint passes

## Functional Requirements

### Server Requirements

#### FR-001: RESTful API
- All endpoints follow REST conventions
- JSON request/response format
- Proper HTTP status codes
- Rate limiting for external API calls

#### FR-002: File System Support
- Support CBZ, CBR, ZIP archives
- Support folders containing image files (jpg, png, webp)
- Extract and cache thumbnails
- Stream images efficiently (range requests)
- Handle large files without memory issues

#### FR-003: Plugin System
- Plugin interface with lifecycle hooks
- Hot-reload plugins in development
- Plugin isolation (errors in one don't crash others)
- Plugin configuration persistence

#### FR-004: Background Jobs
- Periodic metadata refresh
- New chapter detection
- Thumbnail generation queue
- Progress sync cleanup

### Client Requirements

#### FR-005: Reading Experience
- Smooth page transitions (60fps)
- Preload adjacent pages
- Support for double-page spreads
- Customizable background color
- Brightness control (mobile)
- Screen wake lock while reading

#### FR-006: Offline Support (Future)
- Download chapters for offline reading
- Cache recently read chapters
- Queue actions when offline

#### FR-007: Accessibility
- Screen reader support
- Keyboard navigation
- High contrast mode
- Adjustable font sizes (for UI text)

## Non-Goals (Out of Scope for MVP)

- **PDF support**: Focus on image-based formats only
- **Cloud storage integration**: Local server only for now
- **Social features**: No sharing, comments, or community features
- **Built-in manga sources**: Only local files for MVP, plugins later
- **AI recommendations**: Manual organization only for MVP
- **Subscription/payment features**: Free, local-only for now

## Design Considerations

### Minimalist Design Philosophy
- Focus on content, minimize chrome
- Hide UI on scroll in reader
- Clean typography with good hierarchy
- Generous whitespace
- Subtle animations (not distracting)

### Color Scheme
- Light mode: White background, dark text
- Dark mode: #1a1a1a background, light text
- Accent color: Indigo (#6366f1)
- Success: Green, Warning: Yellow, Error: Red

### Layout Principles
- Mobile: Bottom tab navigation
- Tablet/Desktop: Side navigation
- Responsive grid for library (2-6 columns)
- Card-based manga representation
- Full-screen reader mode

### Typography
- Sans-serif for UI (Inter or system fonts)
- Manga titles: Slightly larger, bold
- Body text: 16px base, good line height
- Monospace for chapter numbers/metadata

## Technical Considerations

### Performance Targets
- Library load: < 2 seconds for 1000 manga
- Chapter open: < 1 second
- Page turn: < 100ms perceived
- Smooth 60fps scrolling
- Memory usage: < 200MB for reader

### Security
- Server runs locally by default
- Optional HTTPS with self-signed cert
- API authentication for remote access
- No sensitive data logged

### Scalability
- Database handles 10,000+ manga
- Efficient image caching
- Pagination for all list endpoints
- Lazy loading for images

## Additional Features Suggestions

### Already Discussed
1. Reading progress tracking
2. Search across sources with filters
3. Library with categories and filters
4. Third-party API tracking (MAL, AniList)
5. New chapter notifications
6. Automatic metadata fetching
7. Collections

### Additional Suggestions

#### High Value
1. **Reading Statistics Dashboard**
   - Total chapters/pages read
   - Time spent reading
   - Reading streak tracking
   - Most read genres/authors

2. **Duplicate Detection**
   - Detect same manga from different sources
   - Merge entries while preserving progress
   - Show source alternatives

3. **Batch Operations**
   - Mark multiple as read/unread
   - Bulk add to category/collection
   - Mass delete with confirmation

4. **Smart Recommendations** (Post-MVP)
   - Based on reading history
   - Similar manga suggestions
   - "Because you read X"

5. **Custom Reader Settings Per Manga**
   - Individual brightness/contrast
   - Default zoom level
   - Page turn animations

#### Nice to Have
6. **Import/Export Library**
   - Backup to JSON
   - Import from other readers (Tachiyomi backup)
   - Full library export with images

7. **Chapter Bookmarks**
   - Mark specific pages
   - Add notes to bookmarks
   - Quick jump to bookmarks

8. **Reading Timer**
   - Set reading goals
   - Reminders for breaks
   - Daily/weekly limits

9. **Content Filtering**
   - Tag-based filtering (SFW mode)
   - Parental controls
   - Hide specific content warnings

10. **Gesture Customization**
    - Configure tap zones
    - Custom swipe actions
    - Volume key navigation (mobile)

## Development Phases

### Phase 1: MVP (Weeks 1-6)
- Server with SQLite and local file plugin
- Mobile client (React Native)
- Basic reading with RTL support
- Progress tracking
- Library view with categories

### Phase 2: Cross-Platform (Weeks 7-10)
- Web client (React Native Web)
- Desktop client (Electron)
- Search and filters
- Metadata fetching

### Phase 3: Polish & Advanced (Weeks 11-14)
- Third-party tracking
- Notifications
- Collections
- Plugin architecture

### Phase 4: Future Enhancements
- Offline support
- Additional sources via plugins
- Advanced statistics
- Social features (if desired)

## Open Questions

1. Should the server support remote access (not just localhost)?
2. What's the priority: mobile app or web client first?
3. Should we support reading manga directly from cloud storage (Google Drive, etc.)?
4. Do we need user accounts, or is it single-user per installation?
5. What's the backup/restore strategy?

## Success Metrics

- All MVP features functional and stable
- Library loads in < 2 seconds with 1000 manga
- Page turn latency < 100ms
- Zero data loss on sync
- 60fps scrolling on mid-range devices
- Successful cross-platform builds

