# Native implementation and historical evidence

Latest UI pass: [Desktop Review 18 native alignment](review18-native-ui.md),
implemented in source without additional build/test or runtime screenshots.

Current source: [full migration inventory](full-migration-status.md) and
[Native code 38 audit](native-code-38.md). Swift owns the macOS runtime; Qt/C++
owns Windows/Linux. Electron is no longer an active runtime dependency.
The macOS review bundle was built/opened before the latest source corrections;
these corrections have not been built or tested. Windows/Linux build and full
feature acceptance remain unverified.

The sections below preserve earlier implementation history. Their old limitations,
commands and test counts describe those revisions, not the current source.

## Historical implementation notes

Date: 2026-10-26. The user requested implementation after Review 18. This is the
first native vertical slice, not a replacement for the released Electron app.
Updated 2026-10-27 with settings and Chat reading follow-ups.

> **Resumed 2026-10-27.** Both foundation implementations now build on macOS.
> See the [current checklist](foundation.md) and [latest foundation evidence](foundation-11.md).
> The [manual macOS checklist](MANUAL-MACOS-FOUNDATION.md) covers the remaining
> IME, VoiceOver and real-window acceptance steps.
> Full runtime/user acceptance remains open. The Implementation 04 section below
> records the previous baseline; its results do not replace foundation checks.

## Last verified baseline (Implementation 04)

- Baseline macOS SwiftUI `NavigationSplitView`, system toolbar/popovers and AppKit text input.
  Chat, Translation, quick history, full history with preview, Activity and a
  language settings workspace are connected to persistent session state.
- Quick history supports Up/Down, Return and Escape. The full library separates
  the currently open session from the preview selection, includes unsent Chat
  drafts, and changes sessions only through Open. Search with no matches clears
  the preview instead of leaving an outdated item actionable.
- Independent session drafts, language pairs and model IDs; streaming fake tasks,
  cancellation, retry with new attempt IDs, and rejection of stale events.
- Chat keeps selectable message views during appended output. Reading above the
  end or selecting text pauses automatic following; Back to latest clears the
  selection and resumes it. Each nonempty assistant response has a Copy action
  with confirmation. Qt reconciles stable message IDs instead of rebuilding the
  transcript from each snapshot; macOS uses selectable AppKit text storage.
- Atomic local snapshots, visible save/load failures, write protection for corrupt
  files, partial recovery without automatic provider calls, and normal-quit flush.
  Streaming persistence is coalesced to 200 ms; a crash can lose the latest unflushed
  chunk. A save failure remains visible and a normal quit is refused.
- Qt Quick/QML presentation and C++ persistence/timer adapter for Windows/Linux.
  Built and exercised on macOS with Qt 6.12.0 and CMake 4.4.4. The reducer has
  Node tests; the C++ adapter has Qt tests for persistence, recovery, real timers
  and loading both Chat and Translation QML. Windows/Linux host acceptance is
  still pending.
- EN/VI/JA catalogs and structural metrics are generated from existing product
  sources. Native fonts, colors, decorations and control metrics use platform APIs.
- Settings is a full workspace with General, Appearance and About, searchable
  section navigation and independent content scrolling. Language, light/dark/system
  appearance and content-text size apply immediately and persist in the isolated
  snapshot. Content size scales conversations, translation, drafts and previews;
  native control labels retain their platform size. Real-provider configuration
  and the rest of product settings remain pending.

The three models are deliberately named `demo.standard`, `demo.slow`, and
`demo.failure`. The last model fails its first attempt; retry succeeds. The app
clearly labels these simulations. There is no AI network request, credential
entry, audio capture or Electron data import in this slice.

## Build macOS

Requires Xcode/Swift 6, macOS 15+, and Node 22.13+ for the resource generator.
The observed build used Swift 6.4 and the macOS 27 SDK on macOS 27.0.1 arm64.
Build with an SDK supporting Liquid Glass to get system material behavior; older
systems use their standard SwiftUI appearance.

From the repository root:

```bash
node scripts/native/generate-resources.mjs
swift test --package-path apps/macos
node scripts/native/package-macos.mjs "$(swift build --package-path apps/macos --show-bin-path)"
```

Open `apps/macos/.build/Viezan Native Preview.app` in Finder. The package helper
creates a local development `.app`, with the existing Viezan icon and SwiftPM
resources. It does not install, sign for distribution, notarize or replace Viezan.
`npm run build:native` still builds the existing Electron native helpers.

Data: `~/Library/Application Support/ViezanNativePreview/workbench.json`.
The preview's application ID is `com.viezan.native.preview`.

## Build Windows/Linux

Requires Qt 6.8+ (Quick, QuickControls2, Qml and Test for tests), CMake 3.21+ and
a C++17 toolchain.
Install dependencies only with user authorization. Then use the matching Qt kit:

```bash
node scripts/native/generate-resources.mjs
cmake -S apps/desktop-qt -B apps/desktop-qt/build -DCMAKE_PREFIX_PATH=/path/to/Qt/kit
cmake --build apps/desktop-qt/build --config Debug
ctest --test-dir apps/desktop-qt/build -C Debug --output-on-failure
```

Run `ViezanNativeQt` from the build output. Windows selects Qt's FluentWinUI3
style; Linux uses Fusion with the Qt palette. `QT_QUICK_CONTROLS_STYLE` can override
the default. These are Qt controls, not a WinUI binary or GNOME/KDE certification.
Window decorations stay with the OS/compositor.

For local adapter verification on Apple Silicon macOS, the user authorized
Homebrew installation of `cmake`, `qtbase` and `qtdeclarative` (including required
dependencies). The observed versions are CMake 4.4.4 and Qt 6.12.0. Configure with
`-DCMAKE_PREFIX_PATH=/opt/homebrew`; CMake creates
`apps/desktop-qt/build/ViezanNativeQt.app`, which can be opened in Finder.
This local development bundle links the installed Qt libraries and is not a
portable distribution. It uses Fusion on macOS; the SwiftUI app remains the
macOS presentation target.

Qt stores `workbench.json` under `QStandardPaths::AppLocalDataLocation`, with
organization `ViezanNativePreview` and application `ViezanNativeQt`. No Electron
storage path is used. Qt deployment, installer and signing are not implemented.

## Tests and evidence

```bash
node scripts/native/generate-resources.mjs --check
node --test scripts/native/__tests__/domain.test.mjs
swift test --package-path apps/macos
ctest --test-dir apps/desktop-qt/build -C Debug --output-on-failure
```

See [history follow-up](history-02.md), [settings and screenshots](settings-03.md),
[Chat reading follow-up](chat-reading-04.md),
[verification](verification.md),
[contract](../../../contracts/native-workbench/README.md)
and [ADR 001](adr-001-adapters.md). Historical Qt adapter tests covered QJSEngine; the current reducer is C++. Tests also cover
QSaveFile, QTimer and QQmlApplicationEngine behavior on the host. Neither these
tests nor macOS screenshots establish Windows/Linux accessibility or visual parity.

## Deliberately unfinished

Cloud providers and secure key storage, the shared Rust core, Electron data import,
images/attachments, transcript formatting, full settings, Interpretation,
Dictionary, Translate everywhere, Launcher, Applications and Thermal remain on the
migration roadmap. History is currently a small preview store without retention,
delete/rename/export or migration tooling. Large transcript performance has not
been benchmarked. Primary navigation preference/compact behavior still needs a
complete native parity pass. Mobile remains deferred.

Before rollout, also verify VoiceOver/Narrator/Orca, live VI/JA IME composition,
640-point layouts, light appearance, Reduce Transparency/Motion, text scaling,
sleep/lock/crash recovery, Windows DPI, Linux Wayland and real multi-task stress.
The Fable 5.1 review is still unavailable after the previously reported API-key
failure; no finding here is attributed to Claude.

UI/UX alignment is now the priority; see [Foundation 12](foundation-12.md) for
implemented visuals, before/after captures and remaining Review 18 differences.

Swift visual alignment continues in [Foundation 13](foundation-13.md).
