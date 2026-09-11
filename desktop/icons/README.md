# Runtime icon choices

Original is copied from `build/icon.png`. Six variants are transparent 1024px exports prepared from the six-concept presentation. These files are shipped by the existing `desktop/**/*` packaging rule and selected only by the allowlist in `desktop/app-icons.js`.

They are raster concept artwork. The installed app bundle icon remains defined in package.json; runtime switching changes the macOS Dock or Windows/Linux window icon. Keep the IDs in sync with AppIconChoice and the alternate catalogs under ios/SpecDown/Assets.xcassets.
