# Project: Specdown Desktop

A macOS native desktop application wrapping the existing Specdown web viewer in an Electron shell. This document is the entry point for anyone trying to understand what was built, why, and how the project unfolded.

---

## What It Is

Specdown Desktop is a macOS `.app` (distributed as a `.dmg`) that loads the same vanilla JavaScript markdown viewer used by the web version, adding native desktop capabilities:
- Open any `.md` file directly from Finder (double-click, drag-to-dock)
- Multi-file tabbed interface (up to 10 tabs)
- Persistent state across sessions (open files, scroll positions, theme)
- File watching — auto-reload when a file changes on disk
- Native macOS menus, keyboard shortcuts (`Cmd+O`, `Cmd+W`, `Cmd+1`–`9`, `Cmd+P`)
- Print and PDF export

The web version (`cbremer.github.io/specdown`) is completely unaffected — both share the same `markdown-viewer/` codebase.

---

## Why Desktop

The web version had four hard limitations that the browser could not solve:
1. **Single file at a time** — loading a new file replaced the old one
2. **No persistence** — state was lost on reload
3. **Requires a web server** — even locally, `python3 -m http.server` was needed
4. **No native file system** — couldn't integrate with Finder, file associations, or OS-level drag-and-drop

Three frameworks were evaluated (Tauri, Electron, Swift + WKWebView). Electron was chosen for its JavaScript runtime (reuse all existing code without rewriting), ecosystem maturity, and speed of implementation. See [2026-02-20-brainstorm-desktop-electron.md](2026-02-20-brainstorm-desktop-electron.md) for the full comparison.

---

## Timeline

| Date | Type | Document | Summary |
|---|---|---|---|
| Feb 20, 2026 | Brainstorm | [2026-02-20-brainstorm-desktop-electron.md](2026-02-20-brainstorm-desktop-electron.md) | Problem framing, framework comparison (Tauri vs Electron vs Swift + WKWebView), MVP scope, same-repo strategy |
| Feb 21, 2026 | Spec | [2026-02-21-spec-desktop-v1.md](2026-02-21-spec-desktop-v1.md) | Full technical specification: feature list, architecture, IPC contract, testing strategy, implementation status |
| Feb 21, 2026 | Tasks | [2026-02-21-tasks-session-01-electron-shell.md](2026-02-21-tasks-session-01-electron-shell.md) | Session 1 implementation checklist — Electron shell, DMG CI, dev loop |
| Feb 22, 2026 | Tasks | [2026-02-22-tasks-session-02-native-file-open.md](2026-02-22-tasks-session-02-native-file-open.md) | Session 2 implementation checklist — Native file open, IPC bridge, macOS menus |
| Feb 23, 2026 | Tasks | [2026-02-23-tasks-session-03-file-watching.md](2026-02-23-tasks-session-03-file-watching.md) | Session 3 implementation checklist — File watching (chokidar, per-tab toggle) |
| Mar 02, 2026 | Tasks | [2026-03-02-tasks-session-04-product-ideas.md](2026-03-02-tasks-session-04-product-ideas.md) | Session 4 — All 15 product ideas implemented (search, TOC, split view, diagram export, shareable links, minimap, annotations, GitHub browser, custom CSS, session restore, recent files, global shortcut, Windows/Linux CI) |
| Mar 03, 2026 | Tasks | [2026-03-03-tasks-session-05-verification-checklist.md](2026-03-03-tasks-session-05-verification-checklist.md) | Session 5 verification checklist — what shipped in last 48 hours, what remains, and QA sign-off list |
| Jun 21, 2026 | Tasks | [2026-06-21-tasks-session-06-auto-update.md](2026-06-21-tasks-session-06-auto-update.md) | Session 6 — Desktop auto-update via electron-updater (GitHub Releases feed, mac zip target, background download + install on quit) |
| Sep 05, 2026 | Tasks | [2026-09-05-tasks-session-08-finder-icons.md](2026-09-05-tasks-session-08-finder-icons.md) | Session 8 — Compatible small macOS icons and packaged-icon release verification |
| Sep 07, 2026 | Tasks | [2026-09-07-tasks-session-09-signing-keychain.md](2026-09-07-tasks-session-09-signing-keychain.md) | Session 9 — Backport temporary signing keychain password correction |

---

## Current Status (as of Mar 02, 2026)

| Feature | Status |
|---|---|
| Electron shell (`desktop/main.js`, `desktop/preload.js`) | ✅ Implemented |
| Dev loop (`npm run desktop`) | ✅ Implemented |
| macOS DMG packaging | ✅ CI builds on `macos-latest` |
| Windows NSIS installer | ✅ CI builds on `windows-latest` |
| Linux AppImage | ✅ CI builds on `ubuntu-latest` |
| Jest test suite (141 tests) | ✅ Passing |
| Multi-file tabs (up to 10) | ✅ Implemented |
| Native file open (`Cmd+O`, Finder, drag-to-dock) | ✅ Implemented |
| File watching (chokidar, per-tab toggle) | ✅ Implemented |
| Persistent session restore (electron-store) | ✅ Implemented |
| Recent files menu (`File > Open Recent`) | ✅ Implemented |
| Print / PDF export (`Cmd+P`, `File > Print`) | ✅ Implemented |
| Custom CSS themes (`Appearance > Load Custom CSS Theme`) | ✅ Implemented |
| Global keyboard shortcut (`Cmd+Shift+M`) | ✅ Implemented |
| Native Find menu (`Edit > Find`) | ✅ Implemented |
| Syntax highlighting (22 languages) | ✅ Implemented |
| In-document search (`Cmd/Ctrl+F`) | ✅ Implemented |
| Table of contents sidebar | ✅ Implemented |
| Side-by-side split view | ✅ Implemented |
| Mermaid diagram export (SVG + PNG) | ✅ Implemented |
| Shareable diagram deep links | ✅ Implemented |
| Diagram minimap (fullscreen) | ✅ Implemented |
| GitHub repo file browser | ✅ Implemented |
| Annotation mode | ✅ Implemented |
| Auto-update (electron-updater via GitHub Releases) | ✅ Implemented |

---

## Documentation Conventions

Files in this folder follow the naming pattern:

```
YYYY-MM-DD-<type>-<detail>.md
```

**Types:**
- `brainstorm` — pre-code exploration, problem framing, framework comparisons
- `spec` — technical specification (create a new versioned file for major revisions, e.g. `spec-desktop-v2-tabs.md`)
- `tasks` — session-level implementation checklists (one file per working session)

**Examples:**
```
2026-02-20-brainstorm-desktop-electron.md
2026-02-21-spec-desktop-v1.md
2026-02-21-tasks-session-01-electron-shell.md
2026-02-22-tasks-session-02-native-file-open.md
2026-03-10-tasks-session-03-file-watching.md       ← future
2026-03-10-spec-desktop-v2-tabs.md                 ← future major spec revision
```

New sessions: add a tasks file with the next session number and a short topic slug. Update the timeline table in this README.
