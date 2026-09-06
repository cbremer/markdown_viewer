# Tasks — Session 01: Persistent Bookmarks

**Date:** 2026-09-06

## User outcome

Save a frequently used document deliberately and recall it later, independently of recents. Keep its bookmark when its location changes and let the user reconnect it.

## Implemented

- [x] Global Bookmarks button remains accessible with no document open.
- [x] Bookmark current file through the toolbar, command palette, Cmd/Ctrl+D, and iPhone action sheet.
- [x] Search bookmarks by display name, filename, or location; edit display names and URL addresses.
- [x] Separate versioned bookmark storage; no automatic eviction when new files are opened.
- [x] Desktop paths and URLs reopen their current content. Existing tabs are reused.
- [x] Missing desktop file: keep the entry, show recovery guidance, and reconnect with Locate file.
- [x] Files without a reusable path (browser/iOS) retain an explicitly labeled saved copy, with Replace copy for updates.
- [x] Removal has inline confirmation and does not delete the original file.
- [x] Storage failures are visible; malformed storage is not silently overwritten.
- [x] Accessible dialog, focus trap, Escape dismissal, safe text rendering, narrow-screen layout.
- [x] Cancel obsolete asynchronous recalls after dismissal or another recall.

## Design and limits

The localStorage key is `specdown-bookmarks-v1`. Entries have independent IDs, names, source filenames, source kind/reference, and save timestamps. Only saved-copy entries store document content. Desktop path and URL identity is reference-based; two unrelated files with the same filename remain distinct. Saved copies deduplicate only when their identity matches or their filenames and complete contents match.

Desktop reading uses typed request/response IPC through the existing bridge, rejecting subframes, nonabsolute paths, unsupported extensions, directories, and files over 8 MiB. No native privileges are exposed to browser content. Reconnection uses a dedicated file input and Electron's preload `getPathForFile`, avoiding the removed `File.path` API and avoiding capture of unrelated file-open events.

Snapshots are local to the app/browser profile, not cloud synced. Clearing app/browser storage removes them. Initial copies are limited to 1,048,576 characters and replacement uploads to 1 MiB; storage quota may impose a lower total. Explicit failure leaves previous bookmarks intact. This is manual relocation, not automatic filesystem-wide tracking. Native iOS files currently use saved copies rather than security-scoped file bookmarks.

No dependency changes or release-pipeline changes. Existing roadmap and architecture work was preserved.

## Validation

- `npm test -- --runInBand --silent`: 652 passing tests in 39 suites (23 new tests).
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed, with existing Vite config-loader and large-chunk warnings.
- Browser: Chrome via Computer Use at `http://127.0.0.1:5179/`; in-app browser unavailable in this session.
- Verified the real app's save → rename → reload → recall sequence with a sample URL bookmark; the document reopened from a fresh app session.
- Verified search matching/no-results states and inspected the dialog at desktop size and 390 × 844. No relevant browser console errors in the inspected log.
- Local upload automation returned “Not allowed”; native file-picker behavior and installed Electron/iOS device behavior are not claimed as end-to-end verified. Saved-copy serialization/recall/replacement and moved-path recovery are covered by automated tests.

## Regression cases

Distinct same-named files; duplicate saves; restart persistence; current desktop reads; missing paths; reconnect/cancel; saved-copy replacement; tab reuse; canceled async recall; URL updates; search and safe filenames; confirmed removal; full/corrupt storage; iPhone actions; native IPC validation and bounded reads.

## PR review follow-up

Guarded UUID generation for runtimes without `crypto.randomUUID` and replaced `AbortSignal.timeout` with an AbortController timer, cleared after response-body completion or failure. Added regression tests with both newer APIs unavailable. All tests, lint, typecheck, and build pass.
