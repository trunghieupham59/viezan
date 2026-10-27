# Native code 36: native runtime cutover

The user explicitly requested completion across modules and waived build/test
execution. This pass implemented the remaining native services and switched the
project's active runtime/build/packaging entrypoints.

Changes include cloud/system/Edge speech, system/mixed capture and input selection,
interpretation analysis and speaker-name editing, usage/pricing, origin-scoped
bridge autostart, themes/modules, diagnostics/login, local model performance
profiles, patched-runtime discovery, thermal profiles/calibration, macOS preference
reset with journal recovery, region screenshots/Wayland portal, currency/file/web
launcher actions, tray/menu lifecycle, single-instance handling, backup preferences,
history trimming and attachment quarantine. See full-migration-status.md for paths.

The source cutover removes the Electron tree, dependencies, preload compiler and
host/development/installer/updater entrypoints. The exact retired paths have a
recoverable source copy at:

`/private/tmp/viezan-electron-source-recovery-id3tw63t/recovery.json`

That directory is a temporary local recovery copy, not a shipped dependency or a
permanent backup. Tracked retired files also remain in Git history. Existing build
outputs, installed dependencies, profiles and credential stores were not cleaned.

The root README describes native commands and the acceptance boundary. The former
committed README is retained as historical documentation. Earlier native-code notes
remain chronological evidence; their pending-feature lists are superseded by the
current source inventory. The pre-existing README review record was not refreshed
or represented as a native review result.

Execution performed: source reads/edits and native resource generation. Execution
not performed: compile, build, test, lint, visual QA, dependency installation,
actual OS cleanup/fan control, user-data migration, installer/signing/notarization,
release publication, commit or push. CI/release definitions were only edited.
