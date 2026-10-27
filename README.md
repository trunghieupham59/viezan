# Viezan

Local-first AI chat, translation, dictionary and live interpretation for desktop.
The application is now implemented in **SwiftUI/AppKit + Swift on macOS** and
**Qt Quick/QML + C++ on Windows/Linux**. There is no Electron main process,
preload, renderer host, updater, builder or Electron dependency in the active
application or package manifest.

This checkout is a **source migration awaiting full runtime acceptance**.
The macOS Desktop Review 18 bundle was rebuilt and opened on 2026-10-27
from the latest UI source. Windows/Linux compilation, automated tests and full
feature acceptance remain unverified. No additional build or test was run while
preparing the migration PRs. Existing GitHub releases may still be the previous app.

## Features in the native source

- Ollama, LM Studio, llama.cpp, OpenAI, Claude and Gemini streaming, model discovery, cancellation,
  retries, conversation-specific settings and careful reasoning, Markdown, charts
  and image attachments.
- Translation language pairs, styles, phonetics, annotations, rewrite, chunking,
  model comparison and sentence assembly, model-specific reasoning effort and opt-in
  automatic translation after edits; dictionary details, context and favorites.
- Image translation with validated text regions, native overlays, original/translated
  text and image export. Source attachments and completed results survive native backups.
- Search and resumable research, saved prompts, image generation/editing and OCR.
- Microphone, system and mixed audio capture; language-aware STT with explicit
  provider selection or opt-in automatic routing, translated interpretation,
  subtitles, pause-based speaker hints/names, summaries, action items, decisions,
  history and TXT/SRT export. Speaker hints are not acoustic identity recognition.
- System, Edge, OpenAI, Gemini and ElevenLabs speech; provider credentials stored
  through OS credential facilities rather than renderer storage.
- Desktop Review 18 UI organization: compact composer tools, translation options,
  category-based Settings, searchable interpretation history, responsive application
  details, dedicated desktop-tools pages and a recent-work Home workspace.
  Background interpretation exposes Open/Stop while navigating; closing the main
  window stops capture. Latest UI edits await
  visual/runtime acceptance.
- Independent app/chat navigation, native detached Quick Chat and translation
  panels, global shortcuts, application/file launcher, calculator, currency
  conversion, browser search and native window/tray lifecycle.
- macOS application inventory, selected uninstall/reset plans, Trash operations,
  preference backup/reset, journals, recovery and undo; thermal monitoring,
  fan profiles, calibration and helper lease restoration. Linux exposes available
  hwmon readings; Windows uses system application settings for app management.
- Local Ollama management, model downloads/deletion, runtime limits, GPU/hybrid
  comparison and persistent measured profiles; optional prepared Windows runtime.
- EN/VI/JA, theme presets and accents, reading size, module preferences, login
  startup, permission links, diagnostics and token usage with user-entered pricing.
- Authenticated loopback Chrome-extension bridge, allowed origins, native speech
  adapters, session/history backup and offline legacy conversion. Backups exclude
  provider credentials and bridge authentication tokens.
- Native installer packaging and update discovery/download with bounded transfers
  and SHA-256 verification. Installation is explicit; the running binary stays
  intact during download. Windows verifies installer signatures before opening.

## Source layout

| Path | Purpose |
| --- | --- |
| `apps/macos` | Swift package: native UI and application/domain services |
| `apps/desktop-qt` | C++ services, QML UI and CMake project |
| `native` | macOS filesystem, SMC and privileged fan helper sources |
| `apps/packaging` | Native entitlements, per-user Windows installer and Linux desktop entry |
| `scripts/native` | Resource generation, build, packaging and offline migration |
| `contracts/native-workbench` | Shared data/resource contracts and translation policy |
| `chrome-extension` | Browser extension, connecting to the native loopback bridge |
| `src` | Retained renderer/design reference; locales, tokens and icon catalog feed native assets |
| `docs/migration` | Implementation inventory, data migration and acceptance notes |

The retained React/TypeScript reference is not loaded by the native app. Node,
React and esbuild are development-only resource-generation tools. QML uses binding
expressions; application state and privileged services execute in C++.

## Build when ready

Prerequisites: macOS 15+ with Xcode/Swift 6 for the macOS target; Qt 6.8+ with
Quick, Quick Controls, QML, Widgets, Network, Concurrent, Multimedia, TextToSpeech,
WebSockets, SVG (plus DBus on Linux), CMake 3.21+, a C++17 compiler and Python 3.11+ for
Windows/Linux. Resource regeneration uses Node 22.13+ and the locked development
dependencies. Committed native resources let you build without Node.

```sh
# macOS: creates an application bundle including native helpers
python3 scripts/native/build.py --target macos --configuration Release --output .native-build/macos

# Windows/Linux: use the installed Qt kit
python3 scripts/native/build.py --target qt --configuration Release --output .native-build/qt --qt-prefix /path/to/Qt/6.8/kit

# Only after modifying canonical locales/tokens/icons
npm ci
npm run resources
```

Choose a fresh output directory for each macOS app bundle. Add `--launch` only
when you want to start the resulting application. `npm run build`, `build:mac`,
`build:win` and `build:linux` call these native entrypoints. No dependency manager
is invoked by the native build helper.

```sh
# Package an already-built app; output must be a new directory
python3 scripts/native/package.py --input .native-build/macos/Viezan.app --output .native-packages/macos --identity "Developer ID Application: …" --notary-profile Viezan
```

Windows packaging requires `windeployqt`, NSIS and an installed signing certificate
(`--qt-bin`, `--certificate-thumbprint`); an optional `--patched-runtime` directory
is checked against its full manifest and pinned binary hashes. Linux packaging requires a provisioned
linuxdeploy executable and its Qt plugin (`--linuxdeploy`, `--qt-bin`). Packaging
emits version/platform/architecture-specific artifacts and checksum manifests.
The manual release workflow uses prepared signing runners and uploads artifacts
for review; it does not publish or install them. Publish the matching manifest
alongside each installer for the native updater to discover it.

## Existing data

Native storage deliberately retains its existing migration-era location to avoid
silently abandoning earlier native sessions: `ViezanNativePreview/workbench.json`
on macOS and Qt's `ViezanNativePreview/ViezanNativeQt` application-data location on
Windows/Linux. The legacy browser profile is not modified automatically.

1. While the previous app is still available, export using the procedure in
   [legacy migration](docs/migration/native-implementation/legacy-data-migration.md).
2. Convert the export offline:
   `node scripts/native/convert-legacy.mjs old-export.json native-backup.json`.
3. In native Settings → Data, preview and import the converted backup. Existing
   IDs are preserved. Restore compatible preferences only if selected.
4. Re-enter provider credentials and pair the browser extension with a new token.

Keep the original export. Conversion preserves the original envelope alongside
mapped conversations, translations, dictionary entries, interpretation, images,
usage records and research checkpoints. Provider-specific legacy metadata that
has no native representation remains in that envelope rather than being silently
fabricated. Importing workspace and interpretation history uses separate atomic
files; retrying an interrupted import deduplicates their IDs.

History trimming is explicit, bounded by a selected count and protects active
sessions, favorites and drafts. Export before trimming. Unreferenced attachments
older than one day are moved to an application-owned recovery directory rather
than permanently erased.

## Platform requirements and limits

- Microphone, Screen Recording and Accessibility permissions are requested by the
  relevant native features. macOS helper installation requires OS authorization.
- Linux global shortcuts and Wayland screenshots require a desktop portal that
  implements those interfaces. Wayland intentionally restricts reading and
  replacing another application's selection; clipboard/manual paste remains
  available. Linux system audio uses a PulseAudio/PipeWire monitor via `parec`.
- Windows capture uses WASAPI; available microphone/speech devices depend on the
  Qt/platform plugins installed with the app. Native Windows selection reading
  depends on the target application's UI Automation support. Replacement/undo is
  available for editable plain-value controls only: the original document and
  selection are checked again, and undo refuses to overwrite subsequent edits.
  Other controls keep the manual copy/paste path.
- macOS application cleanup and fan control preserve their platform scope. They
  are not presented as portable Windows/Linux uninstall or fan-control backends.
- Cloud AI, speech, search and currency conversion need their external services.
  Local model availability depends on the selected runtime: Ollama (`11434`),
  LM Studio (`1234/v1`) or llama.cpp (`8080/v1`), all on `127.0.0.1`. Select a
  provider from the model refresh menu; discovery does not change the current
  conversation model. Only Ollama has managed start/stop/download controls.
  Rates are cached and dated. Automatic STT may send audio to another configured
  provider after a failure; choose an explicit provider to disable that behavior.
- Usage pricing is an estimate for reported input/output tokens; missing usage,
  audio/image/search costs, discounts and taxes are not inferred.
- Update installation remains a user action after quitting. No silent installer,
  in-place updater replacement or automatic rollback is claimed.

See the [source migration inventory](docs/migration/native-implementation/full-migration-status.md)
for implementation paths and the remaining compilation/runtime acceptance boundary.
