# Session 9: Restore macOS release signing

The first failing release was v0.0.187 (September 5 Pacific), before bookmarks.
v0.0.186 signed and notarized successfully with the HTML staging changes present.
Both used electron-builder 26.15.3 and the same dependency lockfile. GitHub's
macOS runner changed from image 20260728.0273.1 (26.5.2) to 20260831.0337.3
(26.6.2), exposing the existing temporary-keychain password bug.

Upstream correction: https://github.com/electron-userland/electron-builder/pull/10172

- Backport the three password-plumbing changes during postinstall.
- Require the expected dependency version and source; fail on drift so upgrades
  explicitly review removal of this workaround. Repeated installation is safe.
- Exercise the installed signing module with mocked security commands, checking
  distinct application/installer import passwords and the random keychain password.
- Add a manual validate-only desktop workflow mode to sign, notarize and inspect
  macOS packaging before merge without publishing or modifying release assets.
- Run clean install, tests, lint, typecheck and production build; verify signing
  on the hosted runner. A local test alone does not establish release readiness.

No certificate or account password change is required by this correction.

Local validation: clean `npm ci` applied the backport; all 655 tests passed
(40 suites), lint and typecheck passed, and the production build passed.
Hosted signing and notarization results are tracked in the pull request checks
and the manually dispatched desktop validation run.
