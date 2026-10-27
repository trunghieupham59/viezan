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
