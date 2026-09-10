# App icon switching

Bundled icon choices for the native SpecDown shells. The original remains the default.

| Date | Document | Summary |
| --- | --- | --- |
| 2026-09-10 | [Session 01](2026-09-10-tasks-session-01-native-icon-picker.md) | Native icon selection, bundled assets, persistence, and validation |

## Try it

- macOS: **Appearance → Dock Icon**. Changes the running Dock icon and restores the selection on launch. Finder and the signed application bundle retain the shipped icon.
- Windows/Linux: **Appearance → Window Icon**. Changes the running window icon; installed shortcuts retain the shipped icon.
- iPhone: **App Icon** on the welcome screen or **More → App Icon** while viewing a file.
- iPad: **Appearance → App Icon** in the sidebar (compact layouts also have the iPhone entry points).
- Choose **Original** to reset. iOS persists its selection through `UIApplication`; desktop stores `appIcon` in its existing state file.

The desktop uses bundled PNGs in `desktop/icons`, already covered by electron-builder's `desktop/**/*` packaging glob. iOS uses six alternate AppIcon catalogs declared in `ios/project.yml`; Xcode generates both phone and iPad alternate-icon metadata. Icons must be bundled at build time on iOS. No downloads, arbitrary file paths, or document-controlled icon changes are supported.

## Artwork

The six concepts were generated and cleaned in this task. Desktop uses transparent PNG exports; iOS uses opaque navy-backed exports. The runtime assets are committed in `desktop/icons` and `ios/SpecDown/Assets.xcassets`. These are raster concepts; review them at native Home Screen and Dock size before deciding on permanent branding.

## Build

Run `npm run build`, then `npm run desktop` for the local Electron app. For iOS, run `xcodegen generate` in `ios/`, then build the SpecDown scheme in Xcode. Existing installed applications do not gain this feature until rebuilt/reinstalled or updated.
