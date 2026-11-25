# Viezan

Local-first AI chat, translation, dictionary and live interpretation for desktop.
The application is now implemented in **SwiftUI/AppKit + Swift on macOS** and
**Qt Quick/QML + C++ on Windows/Linux**. There is no Electron main process,
preload, renderer host, updater, builder or Electron dependency in the active
application or package manifest. Version 2.5.0 is the first release line that
officially retires the Electron app; earlier Electron builds are no longer maintained.

This checkout is a **source migration awaiting full runtime acceptance**.
The macOS Desktop Review 18 bundle was rebuilt and opened on 2026-10-27
from the latest UI source. macOS automated tests and the Release build now pass
in CI. Windows/Linux builds complete; cross-platform regression and CodeQL follow-up
are tracked in PR #178. Full feature and visual acceptance remain separate from CI.
Existing GitHub releases may still be the previous app.

## Features in the native source

- Ollama, LM Studio, llama.cpp, OpenAI, Claude and Gemini streaming, model discovery, cancellation,
  retries, conversation-specific settings and careful reasoning, Markdown, charts
  and image attachments.
- Translation language pairs, styles, phonetics, annotations, rewrite, chunking,
  model comparison and sentence assembly, model-specific reasoning effort and opt-in
  automatic translation after edits; dictionary details, context and favorites.
- Image translation with validated text regions, native overlays, original/translated
  text and image export. Source attachments and completed results survive native backups.
- Selecting an AI model sets the app-wide default for new chats, translations, dictionary lookups and new interpretation sessions, including quick actions. Existing conversations keep their model until you change it within that chat. Running requests and retries use their original model.
- Quick Translate on macOS translates text in a screen region you select, with on-device text recognition and no saved image (unavailable on Qt).
- On macOS, keep up to five floating notes from the menu bar, Quick Translate or AI Chat. Viezan saves notes on this Mac and requests their exclusion from screen sharing. Notes are outside the current backup and are unavailable on Qt.
- Search and resumable research, saved prompts, image generation/editing and OCR.
- Microphone, system and mixed audio capture; language-aware STT with explicit
  provider selection or opt-in automatic routing, translated interpretation,
  subtitles, pause-based speaker hints/names, summaries, action items, decisions,
  history and TXT/SRT export. Speaker hints are not acoustic identity recognition.
- System, Edge, OpenAI, Gemini and ElevenLabs speech; provider credentials stored
  through OS credential facilities rather than renderer storage.
- Desktop Review 18 UI organization: compact composer tools, translation options,
  category-based Settings with separate Voice, Modules and Updates sections,
  dictionary Meaning/Examples tabs, searchable interpretation history, responsive application
  details, dedicated desktop-tools pages and a recent-work Home workspace.
  macOS Dictionary keeps overlong context in the draft and enables lookup once it fits 500 characters.
  The macOS Dictionary lets you fold context with ⌘⇧C and keep the text for lookup. A missing entry offers Translate and Chat as separate actions.
  Background interpretation exposes Open/Stop while navigating; closing the main
  window stops capture. Latest UI edits await
  visual/runtime acceptance.
- Independent app/chat navigation, native detached Quick Chat and translation
  panels, global shortcuts, application/file launcher, calculator, currency
  conversion with a remembered target, browser search and native window/tray
  lifecycle. On macOS the launcher asks AI in the same window and hands the
  conversation to AI Chat. The macOS Launcher also offers Prevent sleep (until Viezan quits), Mute and system-wide Dark mode. Prevent sleep and Mute are macOS-only.
  On macOS, Launcher searches file content through Spotlight without building its own index and prepares “Find files with AI” requests using only the typed query for the selected model (both features are pending on Qt).
  Qt Quick AI groups each question with its reply and opens the model picker for that conversation.
  On Windows, Quick Translate shows a floating card near the pointer and keeps the current app in front. It automatically replaces an editable selection after verifying the focused editor, selection and text. The card offers Undo after a verified edit, or Copy and Open in Translate when automatic replacement is unavailable.
  To use the card with a keyboard or undo after the confirmation closes, press Win+B, choose Viezan in the notification area, open its context menu and select **Review last selection translation**.
  On Windows/Linux, the screen-region selector announces its keyboard controls and the shortcut recorder announces when it is saving.
  The macOS Launcher offers Retry when its application folders cannot be read. The Qt Launcher names all 30 target currencies in the app language and shows relative dates for future file modifications.
- The sidebar identifies history stored on this device separately from live
  background services. Its storage hint explains that AI processing runs locally
  or in the cloud depending on the selected model.
  History search offers to turn off Archive when that filter is active.
- macOS application inventory, selected uninstall/reset plans, Trash operations,
  preference backup/reset, journals, recovery and undo (⌘Z for the latest), Quick Look
  of plan items and drag an app in from Finder. The inventory groups symbolic links
  with their installed app. The uninstall plan lets you select shortcuts in writable
  install folders and verified app-owned items in `/Library` individually. A second
  installed copy still counts when checking shared data. Finder handles machine-wide items
  and requests administrator authentication when needed. Shared items, app groups
  and package receipts stay locked. Restoring a launch service or returning a file to a protected folder uses Finder’s Put Back.
  The thermal workspace supports monitoring of SMC and named IOHID sensors,
  fan profiles, calibration and helper lease restoration. Thermal distinguishes a
  missing reader, a failed read and a device reporting no temperature sensors.
  On macOS, CPU/GPU fan rules use the same SMC sensor groups as the temperature list. A failed fan action is announced again if a retry fails.
  The built-in Quiet profile waits for two CPU readings before raising fan speed and lowers it gradually as the CPU cools. A reading of 100 °C or higher requests maximum speed immediately.
  A team-signed fan helper accepts commands from the logged-in user's Viezan app only when it has the same Team ID, the expected bundle identifier and Hardened Runtime enabled.
  When moving or restoring a broken app link, Viezan stops if the filesystem can no longer confirm the link's identity after the move.
  In uninstall plans, long paths wrap and the Trash button moves to its own row when space is tight.
  Retry waits for the previous reader to exit. The fan control card offers
  registration. While approval is pending it offers removal, System Settings
  and a permission check. Linux exposes available
  hwmon readings. Qt lists Windows/Linux applications and starts their registered
  uninstaller after one confirmation (see limits below).
- Local Ollama management, model downloads/deletion, runtime limits, GPU/hybrid
  comparison and persistent measured profiles; optional prepared Windows runtime.
  On macOS, an Ollama download shows bytes across the layers reported so far. Refreshing installed models updates names and sizes together. Sizes follow the app language. Measured modes are shown as GPU or CPU + GPU.
- Glass shell: light mode layers a cyan scene, floating navigation, an ice-blue
  workspace and brighter frosted cards. Home groups real actions, recent work
  and model status into panels. Reading/composer surfaces remain opaque; native
  window controls stay clear. Dark mode retains its existing glass treatment.
  Qt shell/cards use opaque color composition; Windows/Linux visual acceptance
  is pending.
- Glass AI Chat: a growing capsule composer groups model and recording controls,
  with separate attachment and Send/Stop buttons. Selected models keep a lit
  glass row and checkmark; keyboard focus stays distinct. Both native toolkits
  preserve one editor and its draft when controls move below multiline input.
  In Qt Chat, pasting a clipboard image attaches it to the current draft, up to four images per message.
  macOS empty Chat suggests recurring actions from the last 30 days, weighted
  by recency and time of day. Its tools panel offers four reasoning levels;
  low/medium require model support, while Careful also adds prompt guidance.
  Qt also offers usual actions on Home and in empty Chat, and supports reasoning levels for compatible models.
- Qt Liquid Glass 2.0 on Windows/Linux: Home, Chat, Translate, Dictionary and
  Interpret pages, system pages, category Settings, the Launcher home and states,
  Quick Chat/Translate notices, an automatic update sheet with a 24-hour reminder,
  compact (820 px) and minimum (640×480) layouts, and Ctrl+K rows for calculation,
  Ask AI, translate and look-up. GPU visual acceptance of the later pages, 150 %
  scaling and Narrator checks are still pending.
- Glass buttons throughout the app use native Liquid Glass on macOS 26+,
  with material/opaque accessibility fallbacks. Qt draws translucent control
  faces, directional reflections and local depth; it does not blur the desktop.
  Sidebar selection uses a raised capsule (round in the compact rail); hover
  shows a softer lens, while idle destinations stay clear over the shared pane.
- Shared Glass components: capsule search fields and the composer use inset,
  opaque editing surfaces with neutral focus borders. Filters and Settings
  navigation use raised selection lenses. Floating text panels share one quiet
  perimeter and shadow, preserving readable content and native input behavior.
- EN/VI/JA, the Glass theme in light or dark with optional accents, reading size, module preferences, login
  startup, permission links, diagnostics and token usage with user-entered pricing.
- Native speech adapters, session/history backup and offline legacy conversion.
  Restoring backup preferences also restores pinned models on both platforms. The macOS model picker shows the pin count and ⌘P shortcut.
  Backups exclude provider credentials. On macOS a failed import removes only
  images created by that import. If restoring the previous workspace also
  fails, reload the saved workspace before editing.
- Native installer packaging and update discovery/download with bounded transfers
  and SHA-256 verification. Each package manifest carries an Ed25519 signature
  made with Viezan's own update key, and the apps reject an update whose
  signature does not match the public key they embed, so updates do not depend
  on an Apple or Microsoft certificate. The running binary stays intact during
  download. "Install and restart" then saves the workspace, replaces the app and
  reopens it: macOS swaps the app bundle for the one in the verified disk image,
  Windows runs the installer silently into the current install folder, and
  Linux replaces the running AppImage and keeps the old one beside it as
  `.previous`. Windows and Linux check the package hash again first. Where the
  app cannot replace itself (a read-only or translocated macOS copy, an unpacked
  Windows build, a Linux build not started from a writable AppImage), it opens
  the package for a manual install instead.

Windows 2.5.2 can upgrade directly to the latest native release. Its updater opens
the installer only when Windows trusts its Authenticode signature. If the app shows
a signature error, close Viezan, download the Windows x64 installer from
[GitHub Releases](https://github.com/trunghieupham59/viezan/releases/latest), and
install it over the existing copy in the same folder. This keeps the workspace.
Starting with 2.6.0 the native updater verifies the Ed25519 manifest signature.

On macOS, if Undo cannot return a renamed application to its original path, open
the action history and choose Show in Finder. Move the verified bundle back to
the displayed path and choose Restore again. Undo can also finish an interrupted
restore recorded by 2.6.0.

## Source layout

| Path | Purpose |
| --- | --- |
| `apps/macos` | Swift package: native UI and application/domain services |
| `apps/desktop-qt` | C++ services, QML UI and CMake project |
| `native` | macOS filesystem, SMC and privileged fan helper sources |
| `apps/packaging` | Native entitlements, per-user Windows installer and Linux desktop entry |
| `scripts/native` | Resource generation, build, packaging and offline migration |
| `contracts/native-workbench` | Shared data/resource contracts and translation policy |
| `resources` | Canonical design tokens and native EN/VI/JA catalogs |
| `apps/desktop-qt/qml/icons` | SVG sources packaged directly by Qt |
| `docs/migration` | Implementation inventory, data migration and acceptance notes |

Resource generation uses Node built-ins. QML uses binding
expressions; application state and privileged services execute in C++.

## Build when ready

Prerequisites: macOS 15+ with Xcode 26+ / Swift 6.2+ for the macOS target; Qt 6.8+ with
Quick, Quick Controls, QML, Widgets, Network, Concurrent, Multimedia, TextToSpeech,
WebSockets, SVG (plus DBus on Linux), CMake 3.21+, a C++17 compiler and Python 3.11+ for
Windows/Linux. Resource regeneration uses Node 22.13+. Committed native resources let you build without Node.

```sh
# macOS: creates an application bundle including native helpers
python3 scripts/native/build.py --target macos --configuration Release --output .native-build/macos

# Windows/Linux: use the installed Qt kit
python3 scripts/native/build.py --target qt --configuration Release --output .native-build/qt --qt-prefix /path/to/Qt/6.8/kit

# After editing shared tokens, native locales or resource contracts
npm run resources
npm run check:resources
```

For macOS development, run `npm run dev` (or `python3 scripts/native/dev.py`).
The Debug app has **Development → Rebuild and relaunch (⌘⇧R)**. It keeps running
while the next build compiles, then saves through normal shutdown and reopens.
Build failures leave the current app running; the menu opens `.native-build/dev/build.log`.
Finish IME composition and stop performance benchmarks before reloading. Running
AI/audio work is interrupted on restart, not replayed; saved drafts, history and
the last route use normal workspace recovery.

This workflow reuses `.native-build/dev/swift`, stages and verifies the new bundle,
and retains only `.native-build/dev/Viezan.app` plus `previous/Viezan.app` as the
previous build. Quit the dev app before starting `npm run dev` again, or use its
shortcut. To roll back, quit the app and open `previous/Viezan.app`. Existing
`dev-01`, `dev-02`, etc. are left untouched. Resource regeneration requires Node
on the PATH used for the initial build; Xcode, Python and signing prerequisites
still apply. This is incremental build/relaunch, not in-process hot reload.
Release builds contain no development menu or checkout metadata. Qt keeps its
existing build/launch workflow; the reload shortcut is macOS-only.

For standalone/release builds, choose a fresh output directory for each macOS app bundle. Add `--launch` only
when you want to start the resulting application. `npm run build`, `build:mac`,
`build:win` and `build:linux` call these native entrypoints. No dependency manager
is invoked by the native build helper.

```sh
# Package an already-built app; output must be a new directory
python3 scripts/native/package.py --input .native-build/macos/Viezan.app --output .native-packages/macos --identity "Developer ID Application: …" --notary-profile Viezan
```

For notarized macOS distribution, packaging requires a Developer ID Application identity and an
Apple notarization profile. It signs the helpers and app, staples Apple's tickets
to the app and DMG, then mounts the final image read-only to check its contents.
To repeat the distribution check on a downloaded DMG, run
`python3 scripts/native/verify_macos_dmg.py /path/to/Viezan.dmg` on macOS 15 or later.
Before publication, GitHub Actions tests the uploaded DMG on a fresh Mac of each
architecture. It checks the installed window on first launch and after upgrading
from 2.4.2, 2.5.2 and 2.6.0. The 2.6.0 test uses the native updater's DMG
replacement code. The 2.5.2 updater opens the DMG for a manual install.
If 2.6.0 cannot launch, install the notarized DMG over the existing app in
Applications. See [offline transfer](docs/migration/native-implementation/legacy-data-migration.md)
for history and settings from Electron 2.4.x.
See the [required GitHub Actions secrets](.github/WORKFLOWS.md#macos-release-credentials).

Internal Previews use one Apple Development certificate. The packager checks
its pinned fingerprint on the app and each helper inside the mounted DMG.
Keep this identity and bundle identifier across updates so macOS can recognize
the app's Accessibility and Screen Recording grants. Users moving from an older
ad hoc Preview may need to authorize the first development-signed build.
Public releases require Developer ID and notarization. Choose `preview-arm64.dmg`
for Apple Silicon or `preview-x64.dmg` for Intel. After dragging Viezan to
Applications and trying to open it,
testers who trust the build can use **Open Anyway** if macOS offers it in
**System Settings → Privacy & Security**. Preview DMGs have no native update
manifest.

Windows packaging requires `windeployqt` and NSIS. MSVC builds include the Visual
C++ runtime DLLs from the Visual Studio redistributable directory in both the
installer and the portable ZIP. Rebuild both packages when Visual Studio ships a
runtime servicing update. Supply `--certificate-thumbprint`
to sign the app and final installer with an installed certificate. An optional `--patched-runtime` directory
is checked against its full manifest and pinned binary hashes. Linux packaging requires a provisioned
linuxdeploy executable and its Qt plugin (`--linuxdeploy`, `--qt-bin`). Packaging
emits version/platform/architecture-specific artifacts and checksum manifests.
The manual macOS Preview workflow uploads both verified DMGs as workflow artifacts.
The release workflow runs the macOS tests and installs the Windows candidate over
2.5.2 in a clean runner profile, opens its Qt window, and verifies that the app
loads the bundled Visual C++ DLLs. A trusted Windows signature enables the in-app
upgrade from 2.5.2. An unsigned candidate gets manual installation instructions.
The workflow stops if signature verification reports an invalid or untrusted signature.
A version change on `develop` publishes the installers, manifests and their
`.json.sig` files. Runs from other branches prepare a draft for a new version.
When the version is already public, those runs keep the tested packages in their workflow artifacts.
The release job signs manifests with the Ed25519 private key in the
`VIEZAN_UPDATE_SIGNING_KEY` secret and stops when that secret is missing or does
not match the public key in both `NativeUpdates` sources. Windows and Linux
x64 packaging also writes `latest.yml` and `latest-linux.yml`, which let the retired
Electron app (2.4.x and earlier) update itself to the native app; publish them too.
The Windows installer removes that Electron app first, keeping its data, and stops
if the removal is declined or fails.

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
4. Re-enter provider credentials.

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
  Dark mode in the macOS Launcher requires Automation permission for System Events.
- File search on macOS depends on what Spotlight has indexed. “Find files with AI” currently stops before sending because the shared provider adds chat instructions to the planning prompt.
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
- On macOS, the menu bar uses the Viezan logo. Settings → General can hide or
  restore the status item; hiding it keeps shortcuts and background work running.
- macOS selection translation verifies the edited value before reporting success.
  Editable controls use the native paste command only while the original application,
  document and selection still match. Read-only web text and controls without
  verifiable Accessibility values show a result card for manual copying.
- macOS selected application-data cleanup/reset and fan control retain their
  platform scope. Qt's Applications page uses the Windows/Linux uninstall service:
  registered Win32/MSI uninstallers, a Settings action for Store/MSIX,
  Flatpak, Snap, desktop-owned apt/dnf packages, and selected AppImages to Trash.
  Package removal has no undo; AppImages can be restored using the OS Trash.
  System package removal requires explicit consent plus Polkit authorization.
  This does not remove leftover data. Linux has fake-provider tests only and
  has not been accepted on a real Linux machine.
- With reduced transparency or high contrast turned on, Qt Glass surfaces become
  opaque and use stronger borders; the setting follows the OS while the app runs.
- Qt Launcher file results have no previews.
- Cloud AI, speech, search and currency conversion need their external services.
  Local model availability depends on the selected runtime: Ollama (`11434`),
  LM Studio (`1234/v1`) or llama.cpp (`8080/v1`), all on `127.0.0.1`. Select a
  provider from the model refresh menu; discovery does not change the current
  conversation model. Only Ollama has managed start/stop/download controls.
  Rates are cached and dated. Automatic STT may send audio to another configured
  provider after a failure; choose an explicit provider to disable that behavior.
- Usage pricing is an estimate for reported input/output tokens; missing usage,
  audio/image/search costs, discounts and taxes are not inferred.
- An update installs only when the user chooses "Install and restart"; nothing is
  installed in the background. macOS puts the previous app back if the new one
  cannot be moved into place, and Linux keeps the previous AppImage, but the app
  offers no rollback after a completed install. The self-install has not been
  exercised against a published release on any platform.

See the [source migration inventory](docs/migration/native-implementation/full-migration-status.md)
for implementation paths and the remaining compilation/runtime acceptance boundary.
