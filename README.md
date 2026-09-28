<p align="center">
  <img src="public/icon128.png" alt="Neko-Tab" width="96" height="96">
</p>

<h1 align="center">Neko-Tab</h1>

<p align="center">
  A terminal-style new tab for keyboard-first humans.<br>
  React · TypeScript · Vite · Chrome Extension
</p>

<p align="center">
  <a href="https://github.com/uddin-rajaul/Neko-Tab/releases/latest">Download</a> · 
  <a href="https://github.com/uddin-rajaul/Neko-Tab">Source</a> · 
  <a href="https://discord.gg/QGSnUUAP">Discord</a>
</p>

---

![Screenshot](screenshots/demo.png)

---

## What It Does

Replaces your new tab with a keyboard-driven workspace. No search bar, no shortcuts grid — just a command palette that does everything.

## Features

### Command Palette

`Ctrl+K` or `/` — the only input you need.

| Prefix | What it does |
|--------|-------------|
| `>` | Search open tabs |
| `!` | AI commands |
| `/` | Slash commands |
| `= 1920/2` | Calculator |
| `gh` | URL aliases |
| *(anything else)* | Web search |

Smart routing: type a URL and it navigates, type a keyword and it fuzzy-searches bookmarks, type anything else and it searches the web.

### AI Mode

Type `!` in the palette. Powered by OpenAI, Anthropic, Gemini, or any custom API.

- **Natural language navigation** — `! open slack and discord`
- **History Q&A** — `! what did I do yesterday`
- **AI Memory** — learns your URLs, suggests new ones

### Theming

22+ themes across three categories:

- **Color** — Carbon, Paper, Nord, Solarized, Dracula, Catppuccin, Tokyo Night, Rosé Pine, and more
- **Animated** — Cyberpunk, Aurora, Synthwave, Vaporwave
- **Special** — Retro CRT, Sunset, Ocean, Midnight

Custom background images with dim/blur overlay.

![Settings](screenshots/settings.png)

### Focus Mode

`Ctrl+F` — Pomodoro timer with site blocking.

- Duration presets: 15, 25, 45, 90 min or custom
- Block any site (Facebook, Instagram, TikTok, Reddit, YouTube, etc.)
- Dashboard with streaks, stats, and session history

### Scratchpad

`Ctrl+\`` — slide-in drawer with three tabs:

- **Notes** — freeform text with line/char counter
- **Checklist** — keyboard-driven task list
- **Journal** — daily log keyed by date

### Bookmarks

Quick-links panel below the palette. Add, edit, delete — fully managed from the new tab.

### Google Integrations

- **Calendar** — upcoming events below the clock
- **Gmail** — unread count + latest emails, optional AI digest

Both are opt-in. No permissions requested until you connect.

### Typing Test

Built-in typing test with words/time modes, best scores, streaks, and daily goals.

![Typing Test](screenshots/typing.png)

### Status Bar

Live telemetry at the bottom: memory usage, ping, GitHub streak, focus streak, tab counter, work timer.

### More

- **Startup Sites** — open your daily sites on first tab
- **Font Chooser** — 12 curated monospace fonts
- **ASCII Art** — custom artwork or OS-specific defaults
- **Export/Import** — backup and restore all settings

## Keyboard Shortcuts

Press `?` anywhere for the full cheatsheet.

| Shortcut | Action |
|----------|--------|
| `Alt+K` | Command palette (anywhere in Chrome) |
| `Ctrl+K` | Command palette (Neko-Tab page only) |
| `Alt+Shift+S` | Open startup sites |
| `Ctrl+\`` | Scratchpad |
| `Ctrl+F` | Focus Mode |
| `Ctrl+Shift+T` | Work timer |
| `Ctrl+Shift+R` | New Chrome tab |
| `c` | New Chrome tab (when not in input) |
| `Escape` | Close any panel |

`Alt+K` works globally — even when Neko-Tab isn't open. Use it to quickly launch the command palette from any tab.

## Installation

### From Release

1. Enable Developer mode in `chrome://extensions`
2. Download the [latest release](https://github.com/uddin-rajaul/Neko-Tab/releases/latest)
3. Drag the zip onto the extensions page

### From Source

```bash
git clone https://github.com/uddin-rajaul/Neko-Tab
cd Neko-Tab
npm install
npm run build
```

Then **Extensions → Load unpacked → select `dist/`**.

### Optional: Google Integrations

```bash
cp .env.local.example .env.local
# Add your Google OAuth credentials
npm run build
```

Without credentials, everything works — just no Calendar or Gmail.

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Settings, bookmarks, scratchpad, aliases |
| `history` | Search browser history from palette |
| `tabs` | Search open tabs, manage startup sites |
| `notifications` | Focus Mode completion alerts |
| `declarativeNetRequest` | Site blocking during Focus Mode |
| `identity` | Google OAuth (only if configured) |

## Privacy

Zero data leaves your browser. Everything stored locally via `chrome.storage`. No analytics, no tracking, no external servers.

## Tech Stack

- React 19 + TypeScript
- Vite
- Lucide React
- JetBrains Mono (default), 11 more via lazy loading

## Support

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/uddinrajaul)

## License

MIT

---

## Fork Changes

This repository is a fork of [uddin-rajaul/Neko-Tab](https://github.com/uddin-rajaul/Neko-Tab). The following changes are specific to this fork and are not part of the upstream project.

### 2026-09-14 — Bookmark layout and editing improvements

- **Show all bookmarks in a category** — removed the previous four-item rendering limit. Categories still keep a compact four-row visible area, while additional bookmarks remain accessible by scrolling.
- **Cleaner overflow hints** — persistent scrollbars are hidden. Overflowing bookmark lists use dedicated up/down indicators, and the overall category area has its own independent scroll-direction hints.
- **Fixed new-tab viewport** — the clock, date, greeting, and command/search area remain fixed. When there are many bookmark categories, only the Quick Links category area scrolls instead of the entire page.
- **Stable category layout** — category columns use a width-based grid so entering edit mode does not change the number of categories per row. Long category and bookmark names stay on one line and truncate instead of changing row height.
- **Consistent layered editing** — category names, bookmarks, and new-bookmark forms use the same save/cancel behavior. `Enter` saves the current edit layer, `Escape` cancels it, and another `Enter`/`Escape` exits the overall edit mode.
- **Explicit category-name controls** — category-name editing now includes check/cancel buttons and no longer auto-saves on blur.
- **Safe edit-mode exit** — leaving overall edit mode closes unfinished edit forms and discards unsaved changes.

Implementation history: [PR #1](https://github.com/walle-2017/Neko-Tab/pull/1).

### 2026-09-24–28 — Bookmark drag sorting and Quick Links interaction polish

- **Drag-sort custom categories** — custom bookmark categories can be reordered directly in edit mode. The fixed `Frequently Visited` column remains outside user-category sorting.
- **Drag-sort bookmarks** — bookmarks can be reordered within a category or moved between categories, including empty categories.
- **Precise insertion targets** — category drop positions are calculated per visual row, while bookmark insertion positions are shown between individual links. The active target uses the accent indicator and inactive valid positions remain visible during the drag.
- **Pointer-based drag engine** — replaced native HTML5 drag/drop with Pointer Events for more predictable positioning and release behavior.
- **Continuous auto-scroll** — dragging near an edge scrolls continuously via `requestAnimationFrame`. Bookmark-list scrolling is prioritized before the outer Quick Links category area scrolls.
- **Stable drag visuals** — drag outlines, insertion hints, and edge drop zones are rendered without shifting the normal page layout.
- **Nested-scroll clipping** — bookmark insertion indicators are clipped to the visible area of each independently scrolling bookmark list and stay synchronized while scrolling.
- **Explicit drag cancellation** — a dedicated cancel area appears beside the edit confirmation control; `Escape` also cancels the active drag.
- **Collapsed-state cleanup** — collapsing Quick Links exits edit/drag state and hides the edit control and category scroll indicators until the section is expanded again.

Implementation history: [PR #2](https://github.com/walle-2017/Neko-Tab/pull/2).

### 2026-09-28 — Unified versioning and release workflow

- **Single version source** — `package.json` is now the canonical project version. `public/manifest.json` and the root `package-lock.json` metadata are kept in sync with it.
- **Version validation commands** — added `npm run version:check` and `npm run version:sync`.
- **Build-time protection** — `npm run build` fails when version metadata drifts, and the generated `dist/manifest.json` is forced to use the canonical package version.
- **Consistent releases** — manual releases calculate the next major/minor/patch version from `package.json`, synchronize version metadata, create the matching `vMAJOR.MINOR.PATCH` tag, build the extension, verify the built manifest, and then publish the GitHub Release.
- **Tag validation** — tag-triggered releases must exactly match the version declared in `package.json`, preventing mismatched source, extension, and Release versions.

Implementation history: [PR #3](https://github.com/walle-2017/Neko-Tab/pull/3). First release using the unified flow: [v2.0.4](https://github.com/walle-2017/Neko-Tab/releases/tag/v2.0.4).
