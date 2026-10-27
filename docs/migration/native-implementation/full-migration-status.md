# Native source cutover — 2026-10-27

Scope: replace the desktop runtime with SwiftUI/AppKit + Swift on macOS and
Qt Quick/QML + C++ on Windows/Linux, including the existing product modules.
**Source implementation and runtime acceptance are separate.** At the user's
request, no build, test, lint or manual app execution was performed in this pass.
The earlier macOS review bundle was built/opened before this audit. It does not
validate subsequent edits or Windows/Linux. Nothing here certifies full runtime
parity or a shipped release.

## Runtime cutover

- `electron/`, its TypeScript compiler configuration, HTML host entrypoints and
  development/updater/packaging scripts have been retired from the checkout.
- Root package commands invoke `scripts/native/build.py`; packaging invokes
  `scripts/native/package.py`. Electron/updater/builder/preload dependencies and
  their now-unreachable lockfile graph are removed. No dependency installation ran.
- Swift uses its package targets; Qt uses native CMake targets. Neither imports,
  launches or embeds Electron, Node, Chromium or the legacy React renderer.
- `src/` is retained as design/localization/icon source and migration reference.
  React/esbuild are development dependencies for asset generation only.
- CI definitions now target Swift and Qt. The release workflow prepares native
  artifacts on provisioned signing machines and does not publish automatically.
  No workflow was triggered by this implementation pass.

## Source coverage

| Capability | Swift source (`apps/macos/Sources`) | Qt source (`apps/desktop-qt`) |
| --- | --- | --- |
| Shell, Home, task ownership, persistence | `ViezanNative/ViezanApp.swift`, `ViezanDomain/WorkbenchStore.swift`, `Models.swift` | `main.cpp`, `WorkbenchBridge.cpp`, `WorkbenchDomain.cpp`, `qml/Main.qml`, `HomeWorkspace.qml` |
| Provider streaming, dynamic models, retry/cancel | `LocalProvider.swift`, `CloudProvider.swift`, `ModelCatalog.swift` | `LocalProvider.cpp`, `CloudProtocol.cpp`, `ModelCatalog.cpp` |
| Translation, chunks, comparisons, assembly | `LanguageWorkspace.swift`, `ComparisonPane.swift` | `LanguageSegments.h`, `qml/ComparisonPane.qml`, reducer commands |
| Dictionary details, context, favorites, duplicate history | `DictionaryEntry.swift`, `WorkbenchStore.swift`, dictionary views | dictionary result validation, reducer commands, `qml/DictionaryResult.qml` |
| Research, search, checkpoints | `Research.swift` | `Research.cpp` |
| Markdown, charts, images, image generation/edit | `ChartArtifact.swift`, `MarkdownRendering.swift`, `ImageGeneration.swift`, `Attachments.swift` | `MarkdownDocument.h`, `ImageGeneration.cpp`, `Attachments.cpp`, `qml/NativeChart.qml` |
| Screenshot region / OCR | AppKit screencapture, Vision | Region overlay / Wayland Screenshot portal, provider OCR |
| Audio input, STT, system/mixed capture | `NativeAudio.swift`, `SystemAudioCapture.swift` | `NativeAudio.cpp`, `AudioCapture.cpp` (WASAPI/PulseAudio) |
| System, Edge, cloud speech | `NativeAudio.swift`, `EdgeSpeech.swift`, `BridgeProtocol.swift` | `SpeechSynthesis.cpp`, `EdgeSpeech.cpp` |
| Interpretation, subtitles, analysis, speaker hints/names/export | `Interpretation.swift`, `SpeakerTurns.swift`, interpretation view | `Interpretation.cpp`, `SpeakerTurns.h`, `qml/InterpretationWorkspace.qml` |
| Global shortcuts, Quick Chat, selection translation | `DesktopIntegration.swift`, `DesktopPanels.swift` | `DesktopIntegration.cpp`, `WindowsSelection.cpp`, `qml/DesktopPanels.qml` |
| Launcher, files/folders, calculator, currency/search | `LauncherTools.swift`, `CurrencyRates.swift`, native launcher | `LauncherTools.cpp`, `CurrencyRates.cpp`, desktop integration/panels |
| Applications, reset, Trash, journal, undo | `Applications.swift`, `ApplicationPreferences.swift`, native filesystem helper | Native app catalog and Windows system settings (macOS cleanup was platform-specific) |
| Thermal/fans, profiles/calibration, helper | `ThermalMonitor.swift`, `FanProfiles.swift`, native SMC/fan helper | Linux hwmon monitoring; no invented Windows sensor/fan support |
| Local AI management, runtime, performance profiles | `LocalModelManager.swift`, `LocalRuntime.swift`, `LocalPerformance.swift` | Corresponding C++ services; prepared patched Windows runtime support |
| Settings, permissions, startup, diagnostics, themes/modules | Native settings views and domain preferences | Settings QML, desktop integration and domain preferences |
| Usage and per-model pricing | `UsageSettings.swift`, token usage callbacks | `qml/UsageSettings.qml`, provider usage events |
| Extension bridge, origins, authentication, TTS | `ExtensionBridge.swift`, `BridgeProtocol.swift` | `ExtensionBridge.cpp`, shared speech services |
| Backup/import, preferences, history retention | `NativeBackup.swift`, `DataSettings.swift`, store maintenance | `NativeBackup.cpp`, `qml/DataSettings.qml`, domain maintenance |
| Update discovery/download/integrity | `NativeUpdates.swift`, update settings | `NativeUpdates.cpp`, `qml/UpdateSettings.qml` |
| Packaging/signing/notarization | `scripts/native/build.py`, `package.py`, `release.py`, `apps/packaging/` | Same platform-aware entrypoints |

Relative basenames in the Swift domain column are under `ViezanDomain`; view
basenames are under `ViezanNative`. Supporting code is distributed among those
files; this is an inventory, not an automatically generated test result.

## Deliberate platform and data boundaries

- Wayland does not provide unrestricted cross-application selection replacement.
  The application uses available portal/selection interfaces and manual clipboard
  handoff where required. Missing portals surface errors rather than fake success.
- Application cleanup and fan control preserve the previous macOS scope. Linux
  hwmon is read-only. Windows system settings remain the native management path.
- Speaker labels are pause-based hints and editable names, not biometric identity.
- History trimming is explicit and protects active work/favorites/drafts. Duplicate
  dictionary results archive the previous entry and retain its favorite state.
  Attachment collection quarantines old unreferenced files for recovery.
- Legacy transfer preserves the original envelope as well as mapped records.
  Irreconstructible aggregate old cost metadata stays in that envelope. Native
  imports do not migrate credentials or silently grant privileges.
- Update downloads preserve the current executable. Installation is explicit;
  in-place automatic updates and automatic rollback are not claimed.
- Native storage identifiers retain migration-era names for continuity. Renaming
  the UI does not discard existing native sessions or credential-store entries.

## Follow-up source corrections

[Native code 37](native-code-37.md) corrects the Qt request-preparation guard,
tracks workers by attempt with re-entrancy protection, blocks unsaved provider
dispatch, bounds workspace persistence and fixes cancellation of currency lookups.
It also adds checked Windows UI Automation replacement and explicit undo for
compatible plain-value controls. None of these additions has been built or run.

[Native code 38](native-code-38.md) records the latest source audit and corrections:
image translation/export, LM Studio/llama.cpp, translation reasoning/auto-translate,
Chat careful reasoning, automatic/language-aware STT, interpretation persistence
barriers, legacy image recovery and remaining CI/packaging dependencies.

## Acceptance still to be performed by the owner

Compile both targets; exercise provider/model changes during streaming, media
permissions and devices, bridge pairing, cancellation/recovery, history/import,
installer/signature/update behavior, accessibility/IME/focus and platform-specific
OS operations. These checks were explicitly deferred, not marked passed.
