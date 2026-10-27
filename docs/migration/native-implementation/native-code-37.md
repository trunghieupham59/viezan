# Native code 37 — task ownership, persistence and Windows selection

Continuation of the full source migration. No build/test/lint, visual QA or actual
user-data operation was run; these gates remain **Not run** at the user's request.

## Implemented corrections

- Qt `LocalProvider::prepareCall` now returns a typed failed call when a local
  performance comparison owns Ollama. The previous edit incorrectly emitted a
  QObject signal from a free function and referenced an undefined task ID.
- Worker ownership is `(task ID, attempt ID)`. Synchronization handles synchronous
  terminal events without recursive dispatch or using a stale batch snapshot.
  Retired simulation-worker bookkeeping is removed. Shutdown rejects new commands
  and does not re-open a window while cancelling an in-progress screen capture.
- Swift and Qt do not start a newly submitted/retried provider job if its request
  could not be saved. The job becomes interrupted with a storage error and needs
  an explicit retry; existing drafts remain in memory.
- Native workspace reads/writes enforce the 128 MiB boundary, regular-file targets
  and domain validation before replacement. Qt rejects malformed preference and
  usage containers instead of silently converting them into empty objects.
- History trimming follows last activity on both platforms and preserves parents
  of active/favorite comparison sessions. It cannot strand an active child after
  deleting its parent.
- Swift currency queries share one refresh task so editing a launcher query cannot
  cancel the download and lock the following query out for the backoff period.
  Cached update timestamps are bounded before native date conversion on both OSes.

## Windows selection adapter

`WindowsSelection.cpp/.h` captures a UI Automation text range and, when available,
its editable plain ValuePattern. Password, disabled and read-only controls are
excluded. Replacement requires the original document and both selection endpoints
still to match. It writes to the captured element rather than typing into whichever
window currently has focus; no clipboard mutation or synthetic paste is used.

Undo is an explicit panel action. It restores the snapshot only if the current
value still equals the result applied by Viezan. Rich-text or other controls that
cannot provide an exact document/value mapping remain on the copy/paste path.
The service is registered in both CMake targets, exposed through DesktopIntegration
and connected to the translated panel, with EN/VI/JA labels.

## Workflow and evidence

Applied project workflow: `native-migration`; rules: `native-migration` and
`viezan-product-engineering`; skills: `viezan-native-migration` and
`viezan-native-ux`. Existing architecture/acceptance guidance was read, with the
latest user instruction overriding staged acceptance and build/test requirements.
Documentation synchronization here was source-led; historical Electron sync
commands were not run against the retired runtime.

Performed: read source and nearby tests, edit native code/resources/docs, regenerate
native locale/icon resources. Not performed: compilation, tests, lint/Atomic Design
check, UI execution, provider requests, clipboard/other-app edits, install, release,
commit or push. Source inspection is not runtime evidence. The Windows adapter must
be exercised with real UI Automation controls during the owner's acceptance pass.
