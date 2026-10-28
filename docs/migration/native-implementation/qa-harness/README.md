# Native UI QA harness (Review 18 comparison)

Scripts used on 2026-10-27/28 (light mode added in round 5) to compare the native apps with the Review 18
prototype screen by screen. They drive the apps through Accessibility and
`screencapture`; they never change data or system settings. macOS only.

Prerequisites: the terminal app has Accessibility and Screen Recording access;
`magick` (ImageMagick); the repo's `node_modules/playwright` plus installed Google
Chrome (the bundled Playwright browser is not installed, so scripts use
`channel: 'chrome'`).

## Prototype

Scripts load `docs/migration/desktop-review` straight from disk through
`prototype.mjs` (Playwright `page.route`); no server is needed, and a load that
misses a script or does not read "Review 18" fails instead of capturing a
half-built page. For browsing by hand:

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/migration/desktop-review
```

- `capture-dark.mjs <outdir>`: macOS prototype, dark then light, `#app` only, 2x.
- `capture-overlays.mjs <outdir> [macos|windows|linux] [dark|light]`: the prototype's
  ⌘K, History and Activity layers on Translate.
- `capture-plat.mjs <outdir> windows|linux [dark|light]`: same for the Windows/Linux
  variants, one mode per run (default dark).
- `measure*.mjs`: element boxes and computed styles from the prototype (dark).

## macOS app (SwiftUI)

- `mac-capture-all.sh <Viezan.app> <outdir>`: quits/relaunches the preview build
  (`com.viezan.native.preview`), sizes the window to 1400×860 and captures the
  10 sidebar routes as `mac-<route>.png`.
- `macnav.sh <index> <out.png>`: presses the Nth AX button (3 = Home … 11 =
  Utilities, 12 = Settings) and captures the window.
- `macpress.sh AXHelp|AXIdentifier|AXTitle <value>`: press a control by attribute
  (sidebar rows expose `AXIdentifier nav-<route>` and `AXHelp`).
- `winid.swift <owner>` / `winpid.swift <pid>`: CGWindow IDs for `screencapture -l`.
- `click.swift x y`: posts a real mouse click (segmented controls do not expose AX).

- `mac-capture-states.sh <outdir> [prefix]`: the running preview build in its current
  appearance — five routes (each shows its active session) at 1400/820/640 and the
  History, Activity and ⌘K layers at 1400 and 640. Set Settings › Appearance in the
  app first (`-AppleInterfaceStyle` has no effect: the app sets its own color scheme)
  and restore it afterwards. Run it only when no other agent drives the same app.

## Qt app

```bash
.native-build/r18-base-qt/ViezanNativeQt.app/Contents/MacOS/ViezanNativeQt
```

- `qtnav.sh "<sidebar title>" <out.png>`: Qt sidebar rows are AXCheckBox by title.
  It brings the app forward first: Qt does not repaint an occluded window.
- `qt-capture-states.sh <outdir> [prefix]`: Qt counterpart of `mac-capture-states.sh`.
  Qt's AX tree reads flat (`every UI element of window 1`); `entire contents` can be empty.

## Comparing

Resize both captures to the same logical width (prototype 1408 px for the 1408 pt
app frame, native 1400 px) and crop the content column (`+236+0`) so the two are
1:1; stack them with `magick … -append`. For alignment issues, measure bright-pixel
spans per row on the grayscale image rather than judging by eye.
