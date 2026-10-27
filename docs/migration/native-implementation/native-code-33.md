# Native code 33 — providers, media, language operations and data

Source implementation only, 2026-10-27. The user explicitly requested all
features and waived builds, tests, lint and runtime QA. None were run for this
revision. Generating resources is not compilation or verification. This revision
**does not complete the full migration**; see [the capability inventory](full-migration-status.md).

## Source changes

- Swift and C++ transports support OpenAI Chat Completions, Claude Messages,
  Gemini generateContent SSE and Ollama NDJSON. Requests snapshot the owning
  conversation, model, instructions and attachments; retries keep that snapshot.
  Cancelled attempts cannot publish late responses. Stream parsers require a
  successful terminal event and classify authentication, rate-limit, malformed,
  truncated and network failures. Redirects are refused. Tool calls, web search,
  research and generated images are not yet implemented.
- Provider credentials are saved through macOS Keychain, Windows Credential
  Manager or Linux Secret Service (`secret-tool`, externally installed). The UI
  can save/remove keys but cannot retrieve existing secrets. Qt performs key
  access and request preparation on a worker. No plaintext fallback, credentials
  in snapshots, or dependency installation was added.
- Voice input records an explicit microphone session and sends audio to
  OpenAI/Groq transcription or Gemini. Native speech synthesis reads responses.
  Transcripts belong to the recording's original session/revision; if its draft
  changed, the text is retained for explicit insertion. This is voice input,
  **not** the Interpretation/VAD/continuous audio feature.
- PNG/JPEG/WebP/GIF attachments use isolated immutable files, UUID identifiers,
  bounded size/pixel dimensions and native previews. Both transports encode images
  for the selected provider. macOS OCR uses Vision; Qt OCR explicitly sends the
  selected image to the chosen vision model, with cancellation and revision
  ownership. macOS capture uses the system interactive screenshot tool; Qt uses
  the primary screen capture API and reports failure where unsupported (including
  compositor restrictions). No Wayland portal capture implementation is claimed.
- Translation supports the existing 19 target languages, automatic source
  language, six styles, translation with phonetic annotation, phonetic conversion
  and natural rewriting. The resource generator compiles the existing product
  prompt policy into inert JSON templates, including conditional Japanese
  honorific guidance. Native runtimes do not evaluate that TypeScript. This does
  not yet include comparison/assembly, chunk scheduling or detected-language UI.
- Ollama model settings can list, pull with progress, cancel and delete an
  explicitly confirmed model using the existing loopback service. They do not
  install or launch Ollama, alter hardware profiles or manage patched runtimes.
- Session history can rename, archive, restore and export a session JSON document.
  Archiving cancels its running request and selects another usable session.
  It is reversible and does not delete attachment files. Per-session JSON export
  contains attachment references; use a full backup to include their bytes.
- Native backup export/import has a 128 MB envelope limit, SHA-256 verification,
  attached image bytes, preview counts and explicit import. Import only adds
  sessions with missing IDs; it does not overwrite existing IDs or import keys,
  preferences or running tasks. Invalid/absent/conflicting attachment blobs refuse
  the import. Attachment installation precedes atomic workspace publication;
  failures can leave unreferenced blobs, never overwrite existing image bytes.
  This is a native backup format, **not an Electron/IndexedDB migration adapter**.

## Dependencies and boundaries

macOS uses system Foundation, Security, AVFoundation, Vision, ImageIO, CryptoKit,
SwiftUI and AppKit. Qt targets require Qt 6.8 Quick/QuickControls2/QML, Network,
Concurrent, Multimedia and TextToSpeech. Their runtime plugins/codecs and OS
permission behavior still require platform packaging and acceptance. Linux key
storage needs a running Secret Service and `/usr/bin/secret-tool`.

No build, test, lint, installation, actual recording, provider call, model
pull/delete, import of user data, commit, push or release was performed. Existing
Electron code and dependencies remain because the capability inventory is not
covered. Existing foundation build reports describe earlier revisions only.

Protocol references used while implementing:
[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[Claude streaming](https://platform.claude.com/docs/en/build-with-claude/streaming),
[Gemini content generation](https://ai.google.dev/api/generate-content),
[Ollama pull](https://docs.ollama.com/api/pull),
[Ollama delete](https://docs.ollama.com/api/delete),
[Qt media format](https://doc.qt.io/qt-6/qmediaformat.html).
