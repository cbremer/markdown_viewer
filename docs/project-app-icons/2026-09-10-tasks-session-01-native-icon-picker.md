# Session 01 — native icon picker

## Implementation

- Bundle Original plus Flat, Glass, Ceramic, Metallic, Layered and Minimal.
- Add a native desktop Appearance menu with radio selection, validation, reset and persistence.
- Use the Dock API on macOS and window icon API on Windows/Linux; describe their running-app scope in the menu.
- Add a SwiftUI picker with previews, current selection, in-flight disabling and errors.
- Expose the picker from the iPad sidebar and iPhone welcome screen/action sheet.
- Declare alternate catalogs in XcodeGen for iPhone and iPad. The OS persists the iOS selection.

## Validation

Validated in an isolated worktree based on main at 58f7ce3 (v0.0.190), preserving the existing working checkout. No dependencies or lockfile changes.

- Fresh `npm ci`, lint, typecheck and `npm run test:ci`: 41 suites / 665 tests, coverage thresholds passed.
- Production Vite build passed.
- Electron runtime: native Appearance menu cycled every variant and Original; menu state and isolated on-disk preferences matched every selection. A subsequent launch restored the saved Glass selection.
- XcodeGen and unsigned iOS Simulator build passed. Alternate-icon metadata and compiled asset catalog checked for all six icons on phone and iPad.
- `git diff --check` passed.

## Runtime boundaries

The iOS Simulator build validates compilation and bundled assets. Home Screen switching and its system confirmation still require device or booted-simulator testing. Windows/Linux API behavior is unit-tested, not exercised on those operating systems.

Finder and installed shortcut icons retain the shipped identity. No installed user app or user preferences were replaced during testing.
