# Native workbench contract v1

Experimental, JSON-serializable boundary for the first native slice. This is not
Electron's session format and is not a migration/import API.

- `Workspace`: `schemaVersion: 1`, sessions, tasks, active session ID per feature,
  selected feature and UI locale (`vi`, `en`, `ja`).
- Optional `appearance`: `{mode: 'system' | 'light' | 'dark', textSize:
  'small' | 'medium' | 'large'}`. Missing/null means system appearance and medium
  content text. Older v1 snapshots remain readable; unsupported saved values
  reject recovery instead of silently rewriting the snapshot.
- `Session`: stable ID, feature (`chat` or `translate`), title, unsent draft, real
  model ID, source/target language, monotonic input revision, output and messages.
- `Task`: stable ID across retry, fresh `attemptID` for every attempt,
  `attemptNumber`, immutable request snapshot, status and accumulated output.
- `Request`: session ID, feature, model ID, input, source/target, input revision and
  response locale. Changing a selected model only affects the next submission.
- `Message`: ID, role (`user` / `assistant`) and plain text. The assistant message
  ID equals its task ID, so retry replaces that answer without duplicating input.

## Native source extension (2026-10-27, unverified)

Sessions now also support `dictionary`, optional `dictionaryContext` and
`favorite`. Recovery adds an empty dictionary session to old native snapshots.
Request context captures `dictionaryContext`; language/term/context edits invalidate
old Dictionary attempts like Translation. Optional `shell.lastRoute` restores
Home or a feature route; Settings restores as Home. These additions remain v1
backward-readable by the new app; older preview apps may reject new snapshots.

The authoritative Qt reducer is now `apps/desktop-qt/WorkbenchDomain.cpp`.
`domain.js` remains a historical reference and is not embedded in the app.
Model IDs also accept `ollama:<installed-model-name>`. Optional request `messages`
is an array of `{role, content}` captured at submission and reused unchanged on
retry. Older snapshots omit it; their request falls back to the saved input.
The Swift/Qt transports support Ollama discovery and streaming over fixed loopback.
See [Native code 32](../../docs/migration/native-implementation/native-code-32.md).
The new implementation has not been built or tested.

## Commands and events

`navigate`, `select`, `new`, `draft`, `model`, `pair`, `locale`, `submit`, `cancel`,
`retry`, `appearance` are user commands. Appearance accepts a valid `mode` and/or
`textSize`; it changes neither sessions nor immutable running requests. Swift
exposes typed methods; Qt invokes the corresponding
pure reducer from `WorkbenchBridge`. Rendering reads a snapshot, never writes a
file or calls a provider directly.

`receive(taskID, attemptID, chunk, terminal?)` is a provider event. Both identities
must match a running task. Translation also requires the current input revision.
Late chunks after stop, retry, editing input or changing languages are ignored.

```text
submit → running → succeeded | failed | cancelled
restart: running → interrupted
retry: failed | cancelled | interrupted → running (new attemptID)
```

Only one task per session runs at once; different sessions/features run independently.
Translation input/pair edits cancel its task, increment the revision, and clear the
stale output. An invalidated translation cannot retry the old revision. Chat can
hold an unsent next draft during a response.

## Persistence and fixtures

Snapshots are atomic local files in a dedicated preview data directory. Restart
keeps partial output/drafts, marks in-flight work interrupted, and never calls a
provider automatically. Invalid JSON/schema blocks writes; a failed save retains
the in-memory work and displays retry. Normal quit is refused on a save error;
forced termination can still lose unsaved changes.

`fixtures.json` supplies identical deterministic responses and model IDs to both
presentations. `demo.failure` fails the first attempt and succeeds on retry;
`demo.slow` streams slowly so independent cancellation can be exercised.
`recovery-fixture.json` is decoded/recovered by both Swift and Node contract tests.
No fixture is an actual AI answer or translation. The deterministic fixture path accesses no keys, network, system capture,
Electron storage or cloud service. The new Ollama adapter is a separate network path.

The two reducers are provisional platform adapters. They share fixtures, identities
and state rules, not a Rust binary yet. A shared Rust core and secure credential
boundary still require a separate measured bridge spike.


## Native backup envelope (source revision 33)

`format: "viezan-native-backup"`, `version: 1`, `workspace` (base64 JSON bytes),
`sha256` (lowercase hex digest of decoded workspace bytes), and `attachments`
(array of `{id,name,mime,data,sha256}`; data is base64 image bytes). The envelope
is limited to 128 MB and each image to 20 MB. Export includes pending and sent
session images. Import verifies the complete envelope before exposing a preview,
then adds sessions whose IDs do not exist locally. Existing sessions/preferences
and credentials are not replaced; tasks are not restarted or imported. Existing
immutable image IDs with different bytes refuse materialization. This format is
not an Electron export or a lossless migration of every legacy feature.

Optional session fields added by revision 33: `systemPrompt`, `images`,
`translationStyle`, `translationMode`, `archived`; message/provider-message
`images`; request translation options and system prompt; task `errorCode`;
workspace `speechProvider`. Image descriptors are `{id,name,mime}` and refer only
to the native application's isolated attachment directory. Request snapshots keep
attachments/instructions/options stable across retries. UI locale remains EN/VI/JA;
source language can be `auto` and target language uses the generated product list.

## Liquid Glass 2.0 backend (2026-11-03)

All additions are optional. Older snapshots and backups stay readable as before.

- **Dictionary prompt.** `dictionary-prompt.json` holds the one dictionary prompt
  for both apps. `generate-resources.mjs` copies it into `native.json` as
  `dictionaryPrompt`; the apps no longer keep their own copies.
  - Placeholders: `{{TARGET}}`, `{{SOURCE}}` in `system`; `{{TERM}}`, `{{CONTEXT}}`
    in `user`.
  - Examples use `source → target`.
- **Dictionary entry.** Optional `related: {derived?, synonyms?, antonyms?}`, each
  a list of at most 6 words in the source language.
  - Swift drops a malformed block instead of failing the entry.
  - The Qt validator ignores the block.
- **Task.** Optional `started` and `finished`, in seconds since 1970, for the
  current attempt.
  - `submit` and `retry` set `started`.
  - `retry` also clears `finished`.
  - Leaving `running` (succeeded, failed, cancelled) sets `finished`.
  - Tasks interrupted by a quit have no `finished`, so the UI shows no duration.
- **Voice.** Optional `voice.rate` (0.5–2). Only `system`, `edge` and `openai`
  honour it.
  - Edge uses 120 % × rate.
  - OpenAI uses `speed`.
  - Qt's system voice maps it onto QTextToSpeech's −1…1.
- **Workspace.** Optional `smartReset` (bool, default on) and `featureLeft`
  (`{feature: seconds}`), now in the Qt reducer too.
  - Reducer commands: `smartReset`, `leave` (on quit), `launch` (on load) and
    `reopenPrevious`.
  - `navigate` stamps the feature being left and opens a fresh turn after the
    break: Translate 2 h, Dictionary 30 min.
  - The notice is transient (`_resetNotice`): the bridge lifts it into its own
    `resetNotice` property and never saves it.
- **Reducer rules both apps now share:**
  - an unchanged `dictionaryContext` is a no-op;
  - the newest succeeded chat answer can be retried (regenerate);
  - the last enabled workspace module cannot be disabled;
  - `new` sweeps earlier empty, untitled, idle sessions of the feature.

## Liquid Glass 2.0 backend, second pass (2026-11-03)

Again every addition is optional; `recovery-fixture.json` stays an old-format
snapshot on purpose and still loads in Swift, Qt and the reference tests.

- **Dictionary prompt** now also asks for:
  - `contextSense` (1-based translation that fits the context, ordered first),
    only when a context is given;
  - `exampleRegisters` on each translation, a register label per example in the
    same order as `examples`;
  - a separate reply `{"notFound": true, "suggestions": [{word, partOfSpeech?,
    meaning?}]}` (at most 5; plain strings are accepted) for misspellings and
    non-words.
- **Dictionary entry.** `contextSense` and `exampleRegisters` are lenient: a wrong
  type or an out-of-range sense is dropped, never failing the entry.
- **Dictionary outcome.** A "not found" reply ends the task as `failed` with
  `errorCode: "dictionaryNotFound"`; the output keeps the JSON so the views can
  list the suggestions. Other unusable replies stay `providerInvalidResponse`.
- **Session.** Optional `archivedAt` (seconds since 1970), set when archived and
  removed when restored. The archive groups and sorts by `archivedAt ?? updated`.
- **Image attachment.** Optional `width`, `height` (pixels, read when stored) and
  `generator` (`provider:model` of the image model that drew it). Backups match
  attachments on `id`, `name` and `mime`, so these details never break an import.
- **Reducer rules both apps now share:**
  - every edit of a session updates `updated`, archiving, favourites, model and
    image changes included (as Swift always did); a no-op does not;
  - the first title is the draft's first 64 characters, or the image's name when
    the draft is empty or a file path; an emptied rename falls back to it;
  - Dictionary refuses to submit a context over 500 characters;
  - comparison columns keep the caller's order (the session's model first);
  - `clearHistory` (refused while a task runs) leaves one empty session per
    feature with its model and pair; the app also clears Interpretation;
  - `compareBySentence` is a boolean in the Qt state as in Swift.
- **Audio.** `speak(text, language, source?, provider?)`: `speakingSource`,
  `lastSource` and `preparing` (a cloud voice still being generated); `provider`
  overrides the voice provider for that one reading ("system" after a failure).

## Qt parity pass (2026-11-03)

- **Translate limit.** Both reducers refuse to submit or compare a Translate source
  over 5 000 characters (`WorkbenchStore.translateLimit`,
  `WorkbenchDomain::translateLimit`); the view disables the button.
- **Workspace.** Optional `updates: {autoCheck?, snoozedVersion?, snoozedUntil?}`
  now in the Qt state too (commands `autoCheckUpdates`, `snoozeUpdate` = 24 h).
- **Reducer commands.** `removeSession` (refused while it or a comparison of it
  runs; the active one is replaced by the next or a fresh session) and
  `restoreSession {session, index}` for Undo, as Swift `removeSession` /
  `restoreSession`.
- **Model lineup.** `apps/desktop-qt/ModelLineup.cpp` ports
  `ModelLineup.swift` rule for rule; QtTest reuses the Swift cases.
- **Interpretation.** `cancelSummary()` stops only the analysis being written
  (both apps); Qt adds `restoreSession` and a `summarizing` property.

## Remaining gaps pass (2026-11-03)

- **`local-models.json`:** the Ollama models Settings › Local AI suggests
  (`{id, name, note, bytes}`). `generate-resources.mjs` copies it into both
  `native.json` files as `localModelSuggestions`.
- **Palette and launcher:** `PaletteQuery` (Swift domain) and
  `LauncherTools::paletteQuery` read `= sums`, `? questions` and `t ` / `d `
  prefixes identically. `LauncherHome` / `bridge.launcherHome` list Viezan pages
  and the quick chat to continue (30 minutes fresh).
- **Interpretation:**
  - export takes `translatedOnly`;
  - `reload()` re-reads the store after a failure without overwriting it;
  - Qt sessions carry `deviceID`.
- **Updates:** package size from the release listing, the last check time (not
  saved), and a linear ETA (`remaining(elapsed, fraction)`), none before 2 % or
  the first second.
- **Audio:**
  - a chosen system voice reads only its own language; others use the
    language default;
  - `recordingStarted` for the recording timer;
  - microphone permission as `granted | denied | undetermined`.
- **macOS only:**
  - fan calibration exposes progress, fan i/n and `calibratedAt` (saved,
    optional) with `forgetCalibration()`;
  - Apps items carry `note: "personalData"`; journals expose sizes.
