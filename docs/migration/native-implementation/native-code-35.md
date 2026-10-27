# Native migration source continuation — 2026-10-27

This is implementation source, not build or runtime evidence. The user explicitly
requested no builds, tests, lint, application launch or module-by-module stops.
No dependencies were installed and no real profile was imported or changed.
The migration remains in progress; Electron entrypoints are still present.

## Provider and language workspaces

- Swift and C++ implement web search through configured Tavily/Brave keys or Jina,
  and a resumable research pipeline: up to six initial queries, three rounds of
  up to four gaps, source deduplication, cross-reference and cited synthesis.
  Checkpoints belong to the original task/attempt and survive native snapshots.
- Native credential settings include search and ElevenLabs providers. Provider
  secrets remain in OS credential stores. Search endpoints are fixed and redirects
  are refused. Source text is framed as untrusted evidence.
- Model catalogs query Ollama, OpenAI, Claude and Gemini, including bounded cloud
  pagination. Catalog refresh never selects a model on behalf of a conversation.
- Production work queues no longer synthesize the old demo responses. Existing
  prototype model IDs are migrated to the explicit `ollama:llama3.2` selection;
  users must install that model or choose another installed/cloud model.
- Chat renders completed Markdown with external links restricted to web/mail
  schemes and automatic image loading blocked. Native chart blocks support bar,
  line and pie data, with text values alongside the graphic. Swift tables are
  currently a monospace rendering rather than a full table widget.
- Image generation/editing uses OpenAI or Gemini directly, validates returned
  base64 images and persists immutable attachments. Images can be saved or reused
  in an edit request. No automatic paid-provider fallback is performed.
- Translation supports bounded sequential chunks, two/three-model comparisons,
  stale-revision rejection, sentence selection and assembled translation adoption.
  Sentence assembly requires matching segment counts. Saved prompts are shared
  native data with create/update/delete controls.
- Dictionary adds partial field previews, expandable details, detected-language
  display, per-entry speech, Chat/Translation handoff and favorites filtering.

## Audio and desktop

- Speech supports OS voices and direct OpenAI/Gemini/ElevenLabs synthesis, voice
  selection, queued chunks and cancellation. Gemini PCM is wrapped as mono WAV.
  Speech preferences persist in the main workspace and apply to Interpretation.
- Interpretation preserves separate summary/action-item/decision/speaker-analysis
  sections. Analysis of unlabeled text is instructed not to invent identities;
  this does not establish acoustic diarization parity.
- macOS SystemAudioCapture uses ScreenCaptureKit audio/microphone outputs,
  per-stream resampling, timestamp alignment, bounded mixing and WAV segments.
  System and mixed modes feed the existing translation queue. This code has not
  been compiled or exercised with real recording permissions/devices.
- Launcher includes a bounded arithmetic parser without eval, direct feature
  navigation, and bounded filename searches in Documents/Desktop/Downloads.
  Searches do not read file contents. This is not full OS index/currency parity.
- Context and parallelism settings for owned Ollama processes persist in the
  workspace. Starting/stopping still only controls a process owned by the app.

## History, backup and old-profile export

Native backups now include interrupted task/research state, prompts, image blobs
and interpretation records, with checksums and preview counts. Import deduplicates
IDs without overwriting existing sessions. Interpretation and workspace stores
are committed separately: a failure between them can leave successfully imported
interpretations in place; retry is idempotent and the UI reports a failure.

Archived conversations can be permanently removed after an explicit UI
confirmation. The active conversation has no destructive delete control.
Attachment garbage collection and configurable retention are not yet complete.

The offline migration path is source-only and has not been run on user data:

1. In the old app's developer console, run the contents of
   `scripts/native/export-legacy-browser.js`. It reads a whitelist of persisted
   application fields, recovery records and referenced IndexedDB images through
   readonly transactions. It downloads a checksum-wrapped export without API keys.
2. Run `node scripts/native/convert-legacy.mjs INPUT.json OUTPUT.json`.
   The converter refuses to overwrite output and fails on missing referenced
   images/unsupported provider models rather than dropping them. It converts
   conversations, translation comparisons, dictionary records, interpretation
   segments and drafts to the native backup format. The original export is also
   retained in the converted file's `legacyArchive` field for recovery; that opaque
   field is not imported into the running workspace.
3. Use native Settings > Data to inspect/import the converted backup. Preserve
   both export files until the user has checked all imported content.

The converter is not a LevelDB parser and does not automatically open old browser
profiles. Full legacy settings/usage/research-resume metadata still needs mapping.
Credentials must be configured in the new OS credential namespace.

## Still open

Use `full-migration-status.md` as the working inventory. System/mixed capture on
Windows/Linux, all-device capture selection, Edge voice compatibility, usage/cost
tracking, currency conversion, theme/module preferences, application reset and
complete helper/fan profiles, runtime installation/patching, native packaging and
updates remain implementation work. Generated native locale/icon resources were
refreshed; no build, test, lint or runtime check was run.
