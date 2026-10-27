# Native code migration 32 — 2026-10-27

Status: implemented source only; **NOT BUILT / NOT TESTED** at the user's explicit
request. Earlier foundation build evidence does not apply to these changes.
The user explicitly confirmed full feature parity as the scope; continuing migration does not require intermediate acceptance gates. The scope has not been reduced to Chat/Translation.

## Architecture implemented

- macOS: SwiftUI/AppKit + Swift domain and URLSession transport.
- Windows/Linux: Qt Quick/QML + C++ domain, QSaveFile persistence and Qt Network
  transport. The application no longer evaluates `domain.js` with QJSEngine.
  QML still uses declarative bindings/JavaScript expressions for presentation;
  this is Qt Quick, not Electron, Chromium, Node or a browser renderer.
- Both runtime targets are independent of Electron. The Electron product sources
  are retained because numerous capabilities still lack native replacements.
- No Rust ABI or sidecar was introduced. A measured shared-core decision remains
  open; plain versioned JSON is the cross-platform compatibility contract.

`WorkbenchDomain.cpp` implements creation, validation, restoration, navigation,
settings, drafts, model selection, language pairs, submit, cancellation, retry and
stream events. Requests capture a conversation context at submit; retry reuses
that context even if subsequent messages or the active session have changed.
The existing `domain.js` remains as a historical fixture/test reference, not a
runtime module or the authoritative native reducer.

## Home and Dictionary source

Home now has native SwiftUI and QML views for new Chat/Translation/Dictionary work
and reopening saved sessions. It does no implicit provider discovery or system
scan. The last route is saved separately from the active feature; reopening after
Settings goes to Home. Home's system/shortcut cards, module visibility and exact
recent-activity policy still need migration.

Dictionary adds an independent session, source/target language, term, optional
context, favorite flag, history and an Ollama JSON response view. The response
must contain a headword, source pronunciation, meaning, and 1–6 translations with
pronunciation; an invalid result cannot finish as succeeded. Context edits cancel
in-flight work and increment its revision. Old native snapshots gain an empty
Dictionary session during recovery without starting a request. Term input is
limited to 120 characters; context to 500. The `demo.*` fixtures are not dictionary
fixtures and currently end as failed because their output is not dictionary JSON.
Use an Ollama model for lookup. Favorite filtering/retention/deduplication,
auto-detection, progressive preview/details, pronunciation audio and import remain
unfinished. This is a connected lookup implementation, not full Dictionary parity.

## Real provider path

The model picker includes a **Reload Ollama models** button, localized EN/VI/JA.
It explicitly requests `http://127.0.0.1:11434/api/tags`. Select an installed
`ollama:<model-name>` entry, then send Chat, Translation or a Dictionary lookup. Neither refreshing nor
restoring a session selects a different model automatically. Saved unavailable
model IDs remain selectable so absence from discovery does not rewrite a session.
The existing `demo.*` entries remain explicitly labeled simulations.

Swift `LocalProvider.swift` and C++ `LocalProvider.cpp` issue streaming
`POST /api/chat` requests. Translation supplies a language-pair instruction;
Chat supplies its immutable message context. Neither transport uses Electron IPC.
This is an implementation against the official [chat API](https://docs.ollama.com/api/chat)
and [model list API](https://docs.ollama.com/api/tags), not a successful live-provider
verification. The user must already have Ollama and a model available; this change
installs, starts and downloads nothing. Ollama configuration/model choice determines
whether inference happens locally or through an Ollama cloud model.

Transport boundary: fixed loopback URL, no redirects, proxy bypass, no credentials,
no automatic retries. Cancellation aborts the corresponding network request;
late events must still match task/attempt/revision identity. Unexpected EOF before
`done` is failure. Catalog and individual stream-line payloads have a 1 MiB cap;
whole streams have a 16 MiB cap. Request idle timeout is 120 seconds, maximum stream
lifetime one hour. These are defensive implementation limits, not measured budgets.
All failures currently use a generic localized retry message; provider-specific
error classification is still pending. Model discovery is user initiated.

## Build later, without Electron/npm

Generated resources are included in the source tree. Python 3.9+, Swift/Xcode or a
matching installed Qt/C++ kit are required. These commands have **not** been run:

```sh
python3 scripts/native/build.py --target macos --output /tmp/viezan-native-32-macos
python3 scripts/native/build.py --target qt --output /tmp/viezan-native-32-qt --qt-prefix /path/to/Qt/kit
```

On Windows, use `py -3 scripts/native/build.py --target qt --output C:/build/viezan-native-32 --qt-prefix C:/Qt/<version>/<kit>`.
Use a Qt kit whose compiler is available in the current developer shell.
The macOS helper writes a development `.app` into a fresh output directory and
refuses to overwrite an existing app bundle. Qt builds a development executable
with `BUILD_TESTING=OFF`. Neither target is signed/notarized or a self-contained
Windows/Linux installer; Qt runtime deployment is still required for distribution.
CMake configure/build presets are also available in `apps/desktop-qt`.

Resource maintenance still uses `node scripts/native/generate-resources.mjs`
when editing the canonical locale/token/icon sources. This build-time generator
is not a Node dependency of the native application itself.

## Completion boundary

This change does **not** complete the requested full-product migration. Still open:
Complete Home/Dictionary parity, Interpretation, cloud providers and OS key stores,
image/screen capture, attachments, speech input/output, Translate Everywhere,
global shortcuts, Launcher, Applications, Thermal, extension bridge, the rest of
Settings, import/export of existing Electron data, installers/update/signing.
Do not remove the old application as if those capabilities have replacements.

No existing user data was imported, moved or deleted. Native storage IDs remain
isolated from Electron. No packages were installed and no commit/push was made.

## Verification and capability use

- Read and applied native-migration purpose/workflow, native-migration rules,
  product-engineering rules, `viezan-native-migration` and `viezan-native-ux` skills.
- Applied scoped source-to-prose reconciliation from sync-docs workflow.
- Executed resource generation only (3 locales, 30 structural metrics, icon assets).
- Build, tests, lint, Atomic/Design scanners, docs checks and visual/runtime QA:
  **NOT RUN — user requested implementation only and will test afterward.**
- README review record deliberately not refreshed: the previous record must not
  represent the new implementation as verified. Cross-OS compilation, networking,
  cancellation/retry behavior and the new C++ reducer still require verification.

Full remaining scope is tracked in [full-migration-status.md](full-migration-status.md).
