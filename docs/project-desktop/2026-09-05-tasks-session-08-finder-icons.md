# Session 08 — Fix small Finder icons

## Diagnosis and choice

The authoritative lockfile pins electron-builder and app-builder-lib 26.15.3.
`mac.icon` previously selected `build/icon.png`; no icon generator was committed.
The installed 0.0.186 icon contains PNG payloads in `icp4`, `icp5`, and `icp6`.
Its Info.plist assigns `icon.icns` to both the application and Markdown documents.

[Upstream #9940](https://github.com/electron-userland/electron-builder/issues/9940)
tracks the small-icon regression after the converter replacement.
[#9943](https://github.com/electron-userland/electron-builder/pull/9943) moved to
toolset 1.2.1; the later merged
[#10088](https://github.com/electron-userland/electron-builder/pull/10088) explicitly
fixes PNG data in legacy small chunks by using toolset 1.2.3 and `ic04`/`ic05` ARGB.
Thus a version bump to 26.15.5 alone is not evidence of compatible output.

Commit Apple's generated `build/icon.icns` and select it explicitly. This removes
release-time conversion from the failure path without changing the builder,
lockfile, signing/notarization, or other platform icons. Package verification
requires byte-for-byte pass-through. A separate document-style icon is future
product work, not necessary for this fix. No installed application was modified.

## Changes

- [x] Generate the committed icon from the existing 1024px PNG with sips/iconutil.
- [x] Require `ic04`/`ic05` with ARGB payloads; reject `icp4`/`icp5`/`icp6`.
- [x] Validate container lengths, all ten image representations, fresh Apple
      extraction, decoded pixels against resized source, and packaged registrations.
- [x] Gate macOS artifact upload on verification of the universal packaged app.
- [x] Test incompatible tags, disguised PNG, truncation, invalid lengths, and a
      correctly encoded ARGB icon with deliberately incorrect small artwork.

## Reproduction and verification

Run from the repository root on macOS:

```sh
npm ci
python3 scripts/macos-icon.py generate
npm run desktop:build -- --mac --dir --universal -c.mac.identity=null --publish never
python3 scripts/test-macos-icon.py
python3 scripts/macos-icon.py verify "dist/mac-universal/Specdown Desktop.app"
npm test -- --runInBand
npm run lint
npm run typecheck
```

Verified on macOS 26.6.2 (25G83), Node 22.20.0, builder 26.15.3,
Electron 44.0.0. The universal application build exited successfully. The local
identity override only disables signing for this verification run; it is not
saved in configuration. No DMG, notarization, release upload, or merge was run.

The packaged `Contents/Resources/icon.icns` is byte-identical to the committed
file. Entry payloads include `ic04` (ARGB, 772 bytes) and `ic05` (ARGB, 2187 bytes),
plus the eight PNG Retina/larger representations. No incompatible small tags.
Fresh extraction visibly resembles the artwork at 16px, 32px, Retina and 512px.
The checker confirms `CFBundleIconFile=icon.icns` and both Markdown extensions
with `CFBundleTypeIconFile=icon.icns`.

Small-image comparison uses premultiplied visible channels, including alpha.
The Apple ARGB conversion changes antialiased pixels: 16px mean/max error
2.360/24.980 and 32px 0.979/25.882 in 8-bit units; all other images match exactly.
The small-image limits are 4 mean/40 maximum, and other images 1/8. A vertically
flipped 16px image in a valid ARGB container fails the pixel check. The installed
broken icon fails immediately with `Incompatible small entry: icp4`.

Results: six icon regression tests pass; 38 Jest suites / 629 tests pass; lint
and typecheck pass. The lockfile is unchanged. Existing Vite build warnings
about config loading and bundle size are unrelated.

Only this macOS version's native decoder was exercised. Older supported macOS
versions and their Finder UI still require a release-candidate smoke test. The
release job repeats native extraction/comparison on its `macos-latest` runner
before uploading artifacts. Artwork regeneration intentionally requires macOS;
review and commit the regenerated binary alongside source changes.
