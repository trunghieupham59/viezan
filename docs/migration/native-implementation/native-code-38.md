# Native code 38 — capability and dependency audit

Date: 2026-10-27. Scope: inspect the remaining Electron-to-native capability gaps,
implement the gaps found, and remove retired runtime tooling from active paths.
The user explicitly requested **no further build, test or app execution**.

## Corrections implemented on both native targets

| Gap found | Source correction |
| --- | --- |
| Image translation stopped at OCR/attachments | Shared bounded region-output contract, vision provider requests, native image compositing, readable region text, copy/speech text extraction and image export. Translation accepts a single image with optional text. Invalid region responses fail rather than masquerade as a completed translation. |
| Local engines only accepted Ollama | LM Studio and llama.cpp model discovery and OpenAI-compatible streaming on their fixed loopback endpoints; no cloud credentials or proxy on local transport. Immutable model IDs survive retries and legacy conversion. |
| Translation reasoning selector absent | Persisted session and request effort, native controls and model-family-specific OpenAI/Claude/Gemini payload fields using the existing model policy. Unsupported models and automatic mode retain API defaults. |
| Auto-translate preferences had no native behavior | Persisted opt-in debounce and 100–5000 ms delay control. Scheduling follows user edits, checks session/revision/model/audio/storage ownership, and does not run from startup or backup restoration. Comparison sessions keep explicit submission. |
| Chat reading/careful-reasoning behavior absent | Shared reading and plain-text math prompt, per-conversation careful-reasoning toggle, immutable request snapshots for retry, EN/VI/JA labels and legacy session mapping. |
| STT automatic selection/language context lost | Explicit provider or opt-in OpenAI → Gemini → Groq fallback, configured-key selection, cancellation guards and source-language snapshot. UI explains that fallback can send audio to another provider. |
| Interpretation could proceed after failed persistence | Both implementations stop before the next transcription/translation/summary dispatch when its state cannot be saved. Retry persists its pending state before dispatch. |
| Recovered image result metadata lost | Legacy converter carries source image, matching region output, embedded edited image and a completed task snapshot. Native image views show/export the imported result. Non-chat resubmission clears obsolete message attachments. Unmatched old data remains in the retained original envelope. |

Primary paths: `apps/macos/Sources/ViezanDomain`, `apps/macos/Sources/ViezanNative`,
`apps/desktop-qt`, `contracts/native-workbench`, and `scripts/native`.
Shared resources were regenerated for EN/VI/JA; no third-party package was installed.

## Electron and tooling findings

- `package.json`/lockfile contain no Electron, builder or updater dependency.
  Build/dev/package commands use the native Python entrypoints. React/esbuild
  remain development-only adapters for shared resource generation.
- The prepared-runtime CI action still referenced a removed Electron packaging
  validator. It now calls the standalone native manifest validator.
- Runtime identity and four pinned binary digests now live in one contract used
  by staging and packaging. The validator checks every manifest file, rejects links
  and unexpected files, and checks pinned binaries without executing them.
- Packaging no longer shadows the output artifact name while iterating runtime
  files. Windows release preparation accepts the explicit prepared-runtime path.
- Obsolete Playwright/Vite UI scripts were moved intact to non-executable `.mjs.txt`
  references under `docs/migration/legacy-reference/scripts`. Active ownership,
  dependency grouping, PR guidance and workflow documentation now describe native
  targets. Original workflow documentation is retained separately as history.
- Source searches of the active native app, build/package scripts and CI found no
  Electron imports, launch calls or integration. The remaining active mention is
  the documentation guard rejecting retired dependencies. `src/`, `shared/` and
  historical migration documents remain reference/resource inputs; they are not
  a shipped Electron renderer. The explicit legacy-browser export tool is for
  transferring an existing profile, not a native runtime dependency.

## Boundaries and evidence

Managed local model installation/start/stop remains Ollama-specific. LM Studio and
llama.cpp servers must already be running. OS-specific selection, cleanup and fan
capabilities retain the boundaries in [the inventory](full-migration-status.md).
Update installation remains explicit; automatic executable replacement/rollback
is not claimed. This audit does not turn these boundaries into silent fallbacks.

Performed: source/history inspection, source edits, dependency/path searches and
native resource generation. **Not run:** build, tests, lint, Atomic Design checks,
visual QA, app launch, provider requests, data imports, installation, signing,
release, commit or push. Those checks are deferred by the user's instruction.
The macOS review bundle was built/opened before this audit; it does not validate
these edits. Windows/Linux target compilation remains unverified. This is an
implementation inventory, not proof of complete behavioral parity or release readiness.
