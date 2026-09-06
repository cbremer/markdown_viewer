# SpecDown

A lightweight markdown viewer with **first-class interactive Mermaid diagrams** —
zoom, pan, fullscreen, and present your architecture diagrams instead of squinting
at static images. One shared web app runs on three surfaces: in the **browser**, as
a **desktop app** (macOS / Windows / Linux), and as an **iOS / iPadOS** app.

- 🌐 **Web** — runs on GitHub Pages, installable as a PWA (works offline)
- 🖥️ **Desktop** — Electron app, signed & notarized on macOS
- 📱 **iOS / iPadOS** — native WKWebView shell (build from source — see below)

---

## Features

### Markdown
- Full GitHub Flavored Markdown (tables, task lists, blockquotes, footnotes…)
- Syntax highlighting for code blocks, with a hover **Copy** button
- Clean, readable typography in light and dark themes
- **Raw / preview toggle** and a side-by-side **split view**
- **Table of contents** sidebar with scroll-spy
- **Find in document** (`Cmd/Ctrl + F`)
- **Print / Save as PDF** (`Cmd/Ctrl + P`) — prints the full document as a clean,
  paginated layout (diagrams re-rendered light for paper); the desktop app also
  has **File > Export as PDF…** (`Cmd/Ctrl + Shift + E`) for one-step PDF files
- **Annotations** — double-click any block to attach a sticky note; **export / import**
  the whole annotation set as JSON to move it between devices

### Interactive Mermaid diagrams
- Per-diagram **zoom, pan, reset, and fullscreen** controls
- **Mouse-wheel zoom** and **click-drag pan**; minimap in fullscreen
- **Export** any diagram as **SVG** or **PNG**
- **Presentation mode** — step through a document's diagrams full-screen
- Diagrams re-theme automatically with light/dark

### Getting documents in
- **Drag & drop** or **browse** for `.md` / `.markdown` files
- **Open from URL**, including **GitHub repo browsing** (paste a repo URL and pick a file)
- **Bookmarks** — save frequently used files with **Bookmark** (`Cmd/Ctrl + D`), then recall them from the header’s **Bookmarks** list. Search, rename, remove, or **Locate file** when a desktop file moves. Desktop files and URLs reopen their current source; browser/iOS files without a reusable path retain a clearly labeled **saved copy**, with **Replace copy** to update it. Bookmarks stay separate from recents and are stored on this device (clearing app/browser data removes them).
- **Recent files** list for one-click re-open; **session restore** reopens your last doc on the web
- **Workspace (folder) mode** — open a folder (desktop picker, or drag a folder
  onto the web app in Chromium), browse its markdown in a sidebar, and follow
  relative `.md` links between documents
- **Live reload** (desktop) — file-backed documents refresh automatically when
  they change on disk. The **Live** chip next to the filename shows the state
  (click to pause / resume); **Reload from disk** (⋮ menu or command palette)
  re-reads the file on demand

### Navigation & UX
- **Command palette** (`Cmd/Ctrl + K`) for everything, with fuzzy search
- **Keyboard shortcut sheet** (`?`)
- Auto / light / dark theme that follows your OS, plus reduced-motion support
- Accessible: skip link, ARIA roles, keyboard navigation

---

## Use it

### Web
The hosted app lives at **<https://cbremer.github.io/specdown>**. Open it, drop in a
markdown file (or open one from a URL), and go. Click **Install** in your browser to
add it as a PWA — it then works offline.

### Desktop (macOS / Windows / Linux)
Download the latest installer from the **[Releases page](../../releases)**:

| Platform | Artifact | Notes |
|---|---|---|
| macOS | `Specdown-Desktop-<version>-universal.dmg` | **Signed & notarized**; universal (Intel + Apple Silicon) |
| Windows | `Specdown-Desktop-Setup-<version>.exe` | NSIS installer |
| Linux | `Specdown-Desktop-<version>.AppImage` | mark executable, then run |

On macOS, open the DMG, drag **Specdown Desktop** to Applications, and launch — no
Gatekeeper warning, because the app is signed with a Developer ID certificate and
notarized by Apple.

### iOS / iPadOS
There is **no App Store / TestFlight build yet** — the iOS app currently has to be
**built from source and run via Xcode** on your own device:

```bash
npm install
npm run build                       # build the shared web bundle
brew install xcodegen               # one-time, if you don't have it
cd ios && xcodegen generate         # generate the Xcode project
open SpecDown.xcodeproj
# In Xcode: select your device + your signing team, then Run (⌘R)
```

(CI builds the iOS app for the simulator on every change to verify it compiles, but
does not produce a distributable build.)

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + D` | Bookmark the current file |
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + F` | Find in document (`Enter` / `Shift+Enter` next / previous match) |
| `Cmd/Ctrl + P` | Print / Save as PDF |
| `Cmd/Ctrl + Shift + E` | Export as PDF (desktop app) |
| `?` | Keyboard shortcut sheet |
| `← →` | Previous / next diagram (presentation mode) |
| `+` (or `=`) / `-` / `0` | Zoom in / out / fit (presentation & fullscreen) |
| Mouse wheel over a diagram | Zoom |
| Drag a diagram | Pan |
| `Esc` | Exit fullscreen / close overlays |

---

## Development

The viewer is a **Vite + ES-module** app. All three surfaces load the same build
output from `markdown-viewer/dist/`, so there's one codebase to work on.

**Requirements:** Node.js **22.12+** (see `engines` in `package.json`).

```bash
npm install            # install dependencies

npm run dev            # Vite dev server — http://localhost:5179/
npm run build          # production build → markdown-viewer/dist/
npm run preview        # serve the production build locally

npm run desktop        # build the web app, then launch Electron
npm run desktop:build  # build the web app + a desktop installer (in dist/)
```

### Quality gates (all run in CI on every PR)
```bash
npm test               # Jest unit + integration suite
npm run lint           # ESLint (flat config) — must be clean
npm run typecheck      # tsc --noEmit (checkJs over JSDoc) — must be clean
npm run format         # Prettier (write)
```

### Architecture
- **`markdown-viewer/`** — the shared web app. `src/main.js` is the entry/wiring hub;
  cohesive features live under `src/core/`, `src/features/`, and `src/platform/`.
  Heavy deps (Mermaid) are lazy-loaded; the code is type-checked with TypeScript's
  `checkJs` over JSDoc.
- **`desktop/`** — the Electron shell (`main.js` + `preload.js`). The renderer talks to
  it through a single typed bridge: `window.specdown` (see `markdown-viewer/src/platform/bridge.js`).
- **`ios/`** — the iOS/iPadOS Swift + WKWebView shell (an XcodeGen project).
- **`tests/`** — Jest suite (unit + integration).
- **`scripts/`** — version sync, static copy, changelog generation.

### Releasing
The pipeline is automated — **every merge to `main`**:
1. **Bumps** the patch version and updates `CHANGELOG.md` from the commit history.
2. **Tags** the commit and publishes a **GitHub Release** (release notes = the new
   changelog section).
3. **Builds** the desktop installers (signed + notarized DMG, Windows `.exe`, Linux
   AppImage) and attaches them to the release.
4. **Deploys** the web app to GitHub Pages.

Don't push version tags by hand — let the pipeline handle it.

---

## Documentation

Project history, specs, and design docs live under **`docs/`** (start at
[`docs/README.md`](docs/README.md)):

- `docs/project-desktop/` — the Electron desktop project
- `docs/project-ios/` — the iOS/iPadOS shell
- `docs/project-url/` — URL opening / GitHub repo browsing
- `docs/project-modernization/` — the cross-platform modernization roadmap (the most
  recent and comprehensive)

---

## Tech stack

Bundled by Vite as ES modules (pinned in `package-lock.json`, no runtime CDN):

- **[Marked](https://marked.js.org)** — markdown parsing
- **[Mermaid](https://mermaid.js.org)** — diagram rendering
- **[@panzoom/panzoom](https://github.com/timmywil/panzoom)** — pan/zoom
- **[Highlight.js](https://highlightjs.org)** — code syntax highlighting
- **[DOMPurify](https://github.com/cure53/DOMPurify)** — HTML/SVG sanitization

Desktop packaging via **Electron** + **electron-builder**.

## License

MIT. Bundled libraries retain their own licenses (Marked, Mermaid, Panzoom — MIT;
Highlight.js — BSD-3-Clause; DOMPurify — Apache-2.0 / MPL-2.0).
