# Native code 34 — desktop integration, interpretation and OS services

Source implementation, 2026-10-27. The requested scope remains **all Electron
features and eventual removal of Electron**. This revision does not meet that
scope yet. No build, test, lint, application launch or runtime QA was run, as
explicitly requested. Resource generation only updates bundled source assets.

## Desktop integration and extension transport

Swift and C++ now implement the loopback extension server on port 39875 with
bounded HTTP parsing, origin checks, expiring named tokens, digest-only token
persistence and request cancellation. Token creation reveals the secret once.
Status/configuration, translation and OpenAI speech routes use native providers.
Revocation stops active clients. The listener starts only through an explicit UI
control. Other legacy TTS modes, automatic startup, legacy page-origin CORS
compatibility and old token migration remain outstanding.

macOS uses Carbon hotkeys and explicit Accessibility permission for selected
text. Replacement rechecks the original focused element, selected text and
range. Windows uses RegisterHotKey and UI Automation selection reads. Linux
uses the XDG GlobalShortcuts portal with request timeout/rollback and the X11
selection where available. Wayland selection replacement and an X11 hotkey
fallback are not implemented. Quick Chat and selection translation own detached
sessions; the main window and popups share one native state writer. Launcher
opens catalogued applications, not arbitrary shell commands. Rich launcher
commands/file search and full popup media behavior are still missing.

## Interpretation

Both native targets have microphone capture, level-based speech segmentation,
a bounded queue, STT, streamed translation, transcript history, text/SRT export,
summary generation and a floating subtitle window. Each session fixes its model,
STT provider and languages at creation. Capture can stop while pending work
finishes; cancel invalidates requests and marks unfinished segments interrupted.
Translation of a failed/interrupted segment can be retried when its transcript
exists. Audio temporary files are removed after processing or cancellation.

Swift uses AVAudioRecorder metering; Qt uses QAudioSource PCM with WAV encoding.
The current threshold is a simple energy gate, not neural VAD or diarization.
Segments cap at 20 seconds; silence ends a spoken segment after 800 ms. A backlog
of eight queued segments stops capture and lets queued work finish. Persistence
failure also stops capture. Sessions and segment counts are bounded. The history
file is separate from workbench.json and is **not included in native backups yet**.

System audio/mixed-source capture, input-device selection, speaker analysis,
long-session retention/import, automatic audio playback scheduling, and full
settings parity remain outstanding. Current playback is explicit and disabled
while listening to prevent microphone feedback. This implementation has not been
compiled or exercised with an actual recording.

## Applications and thermal services

macOS Applications source adds inventory, bounded metadata snapshots, residue
inspection, an explicit selected-item plan, normal application quit, open-file
preflight, Trash operations via the existing native file helper, and a persisted
operation journal. Helper receipts allow a subsequent launch to recover a move
that finished before the UI recorded it. Restore rechecks the Trash snapshot,
refuses a destination collision and currently supports the user's home Trash.

Shared, vendor-only, container, preference and system-managed items are shown as
protected or administrator-managed, rather than acted on. This is **not full
parity with the existing preferences/reset executor**. Incomplete scans remain
visible, and the UI does not claim a clean uninstall. Windows/Linux show the
application launcher catalog; Windows can open installed-app system settings.
The feature does not claim a cross-platform native uninstall executor.

macOS thermal source consumes the existing SMC reader and integrates the signed
fan helper through ServiceManagement and its root-owned Unix socket. Manual
requests use a lease/generation to reject late writes after stopping. Heartbeats
preserve the helper's watchdog behavior; automatic restoration and helper
approval are exposed. Linux reads hwmon; Windows has no sensor backend yet.
Fan profiles, calibration, automatic curves and the full helper upgrade/removal
flow remain outstanding. Existing helper safety policy was not loosened.

The macOS packaging script now includes SMC, fan and file helper sources and
stages the daemon plist for the native application identifier. The script was
not run. Signing, notarization and distribution integration remain required.

## Local runtime

Native settings can probe an installed Ollama service, launch an installed
`ollama serve` process with bounded parallel/context settings, and stop only the
process owned by this app. An already running service is left under its existing
owner. App-owned processes bind loopback and disable Ollama cloud features.
Runtime binaries are not downloaded or installed by this change. Qt deployment,
GPU inspection, patched runtime management and profile persistence remain open.
Environment options follow the [official Ollama FAQ](https://docs.ollama.com/faq).

## Verification and retained scope

No build, test, lint, dependency installation, recording, helper registration,
provider request, model operation, application removal, user-data migration,
commit, push or release was performed. Source inspection is not compilation or
runtime evidence. README review fingerprints were not refreshed.

Electron dependencies, main/preload sources and packaging remain. Advanced Chat,
translation comparison/assembly, system audio, Electron/IndexedDB data migration,
provider TTS parity, and production packaging/update still lack complete native
replacements. Removing those Electron sources now would drop existing behavior.
See [the full inventory](full-migration-status.md), which remains authoritative
about incomplete source coverage rather than acceptance status.
