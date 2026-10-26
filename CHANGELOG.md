# Changelog

Curated user-facing changes. This file starts with 2.4.0; see
[GitHub Releases](https://github.com/trunghieupham59/Viezan/releases) for earlier versions.
Entries describe their version's source and do not certify that an installer has been published.

## [Unreleased]

- Fix Applications inventory for plist date/data values, wrapped iOS metadata and protected Apple identifiers; ignore non-bundle Spotlight suffix matches. Read backup checksums through one no-follow file descriptor and add a full native-runtime uninstall/restart/Undo fixture test.

- Harden Applications removal: lock ambiguous ownership and incomplete scans, require opt-in for persistent data, stop on errors, verify preference state/backups, and reconcile interrupted Undo. Containers and launch agents remain read-only in this draft.

- Add macOS Applications: inspect related files, uninstall or reset one app, and
  restore through a local journal. Protect shared/in-use data, retain items needing
  administrator access, and recheck the supported locations after each operation.

- Restore the active chat and text drafts, plus translation and dictionary work
  across navigation and restart. Optionally start fresh after completed work has
  been left for 2 hours (Translate) or 30 minutes (Dictionary), with a way to reopen
  the prior result. Show storage failures and history capacity warnings.
- Packaged macOS builds can install a background fan helper once, reconnect after
  app restarts, and reapply remembered settings after sleep/wake. Quitting still
  returns fans to system control; development builds retain session helpers.
- Keep README facts synchronized with source and require a current documentation
  review before tagging or publishing. Publish curated version notes from this file.

## [2.4.2]

- Improve readability of floating controls in the Glass theme.
- Add a task option flyout and more forgiving language search.
- Update AI provider SDKs, state management and build/lint dependencies.

## [2.4.1]

- Align Settings typography with the shared hierarchy and standardize Vietnamese
  tone-mark placement in interface copy.

## [2.4.0]

### Added

- Thermal monitoring on macOS through SMC and Linux through hwmon, with optional
  menu bar/tray readings. Available sensors and fans depend on the hardware.
- Optional macOS fan control through a privileged session helper, including fixed
  speeds, sensor rules, saved profiles and calibration. Windows thermal monitoring
  and Linux fan control are not supported.
- Feature module toggles with persisted enabled state.

### Changed

- A redesigned workspace shell, Home and Settings, with consistent feature layouts
  and English, Vietnamese and Japanese interface copy.
- Shared header language pairs, navigation typography and text-size scaling.

### Fixed

- IME-safe message submission, Escape handling in open selectors, saved-key
  replacement and keyboard focus behavior.
