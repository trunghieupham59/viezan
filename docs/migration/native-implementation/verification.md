# Native implementation — verification, updated 2026-10-27

Scope: native fake-provider slice. User authorized implementation in this thread.
The older Review 18 report remains the historical design record; its pending
implementation authorization is superseded by that request. Its failed Fable
review is not superseded by any successful external review.

> **Evidence boundary — paused 2026-10-27:** PASS results below are historical
> Implementation 04 results. The subsequent foundation refactor is **NOT RUN** for
> compilation, automated tests and visual QA. Resource generation alone succeeded
> with three locales and 17 metrics. See [handoff](PAUSED-2026-10-27.md).

## Automated checks — baseline 04

| Check | Observed result |
| --- | --- |
| Swift package build | PASS, Swift 6.4 / macOS 27 SDK / arm64 |
| Swift Testing | 17 passed: 14 domain/resource tests plus three actual AppKit text-view tests for appended Unicode selection, retry/font-change range safety and container wrapping |
| Node Qt domain/contract tests | 9 passed; this does not compile the Qt adapter or QML |
| Generated resource freshness | PASS, both bundles identical, three locales and ten canonical metrics |
| TypeScript renderer and Electron noEmit | PASS |
| Biome changed TS/JS/scripts | PASS |
| Atomic Design and design contracts | PASS; existing scanners cover React layers, not native views |
| README documentation freshness/tests | PASS |
| Qt build | PASS on macOS 27.0.1 arm64, Qt 6.12.0 / CMake 4.4.4 / Apple Clang 21 |
| Qt C++/QML tests | PASS: 25 scenario rows, plus init/cleanup (QtTest reports 27 passes). Existing 19 rows plus six VI/EN/JA wide/640-point Chat cases for stable native delegates, selection/reading-position preservation after append, Back to latest, session switching and background-task/draft isolation |

## Direct macOS UI checks

Observed in the built `.app` through native accessibility and screenshots:

- App opens with system navigation/toolbar, opaque reading and composing surfaces.
- Chat input and Command-Return send; deterministic output appears.
- A follow-up draft remains after switching to Translation, quitting and reopening.
- Translation input and result remain after restarting the app.
- Changing output language VI → JA clears the old result and disables Copy. A new
  submission displays the Japanese-labeled simulated result.
- Chat and Translation preserve separate model choices.
- History initially showed no records for an empty query. Fixed in the domain;
  regression test added. Reopened popover now shows the selected session.
- History search receives initial focus. Accent-insensitive search for
  `lap ke hoach` finds the conversation; Return opens it.
- Full history opens a list/preview with an explicit Open action and Back control.
- Selecting `demo.failure`, sending, then Retry produces an answer without another
  user message. Empty failed messages now show their actual status instead of
  “running”; the regression was fixed after UI inspection.
- Native Window → Move & Resize → Left and Return to Previous Size work. Exact
  640-point geometry was not established by the available drag interaction and
  remains a required acceptance check, not a pass.

The independent cancellation/late-event matrix was exercised in both reducer
suites. A complete interactive multi-task timing/stress pass is still outstanding.

Screenshot: [SwiftUI Translation](evidence/macos-translation.png).
This is the actual native app with fake data, not the browser prototype.

## Qt adapter follow-up on macOS

The user explicitly authorized installing Qt 6 and CMake. Homebrew installed
`cmake`, `qtbase`, `qtdeclarative`, and their dependencies, including qtsvg. It also
updated required existing dependency packages; no cleanup was requested.
Observed package versions: CMake 4.4.4, qtbase 6.12.0_2, qtdeclarative 6.12.0_1.

Actual build/runtime checks found and fixed:

- QVariantList exposed through `toScriptValue` was not a JavaScript Array and
  failed recovery validation. The adapter now crosses the JSON contract explicitly;
  roundtrip and shared-fixture tests exercise the real Qt engine.
- QML Item's built-in `data` property shadowed application state in children.
  All state bindings now use `root.workspace`.
- History coordinates were evaluated before layout, opening at the wrong edge.
  Placement is now computed on opening and window resize; the native screenshot
  confirms the trailing toolbar anchor. Escape returns focus to its trigger.
- Model labels clipped, and editable scroll content could grow horizontally.
  Pickers measure their longest label; editor widths follow the available surface.

Direct UI observations: Chat submission streamed a simulated response; its next
draft survived switching to Translation. Translation kept a separate input/result.
Changing VI to JA cleared the old result and disabled Copy; submitting again
produced the Japanese-labeled simulation. Quick history, initial search focus,
full-history entry, and explicit Open/Back were exercised. After Command-Q, app
inventory confirmed the process was no longer running. Reopening restored the
Japanese output, language pair, Chat response and unsent follow-up draft.
Sleep/lock/crash behavior still needs a separate lifecycle pass.

Screenshots: [Qt history](evidence/qt-macos-history.png) and
[Qt Translation](evidence/qt-macos-translation.png), captured from the actual Qt
application on macOS using Fusion. These are not Windows/Linux screenshots.
CTest reported one offscreen macOS font-alias diagnostic for “Sans Serif”; there
were no QQmlEngine loading warnings in either tested screen.

## History follow-up — implementation 02

Both native targets were rebuilt after the history changes. Swift's 11 tests and
the expanded 12 Qt scenarios passed. Qt library cases assert that selecting a
preview and filtering to no results leave the workspace unchanged, clear stale
selection, and disable Open. At 640 points the offscreen QML tests also assert
one-column layout and an Open action inside the window bounds. These geometry
checks do not establish manual compact-layout or accessibility acceptance.

Direct checks in both apps used multiple sample sessions. Up/Down and Return in
quick history opened the intended session with its draft preserved. In the full
library, selecting another item changed only the preview; the current-session
marker stayed on the active item, and Back restored that session's draft.
SwiftUI's explicit Open was additionally verified to restore the previewed
conversation and its unsent draft. Search `thu hai` matched Vietnamese text with
diacritics. An observed SwiftUI Escape issue (search clearing instead of closing)
was fixed through the native search delegate, then rechecked with a nonempty query.

The Qt list initially compressed too far beside its preview; explicit width
constraints now keep it readable in the wide layout. The SwiftUI model picker
also has a minimum structural width. Screenshots and interaction details are in
[implementation 02](history-02.md). No real provider or Electron behavior changed.

## Settings follow-up — implementation 03

Both native builds and the expanded suites above passed. General/Appearance/About
are a full workspace, with search, section navigation, compact menu and read-only
scope/recovery explanations. Settings use the existing isolated atomic snapshot;
appearance is optional for older v1 files and invalid values fail closed.
Content scaling comes from token-derived factors, applied to system body fonts.
It does not scale control labels or replace a full OS text-scaling acceptance pass.

Direct checks in SwiftUI and Qt: Light/Dark changed the window, Large changed
content, `co chu` filtered to Appearance, no matches produced an explicit empty
state, and returning to Chat retained the same conversation, model and unsent draft.
Normal quit was independently confirmed in app inventory before reopening. Both
apps restored Light/Large and drafts; SwiftUI additionally restored Japanese
interface language. The platform Preferences shortcut opened Settings in both
apps. Review preferences were returned to System/Medium/Vietnamese.

The QML cases use the actual visual tree (including Loader-created controls),
verify appearance-control bounds and wide/compact layouts, and assert that search
does not mutate workspace state. These tests do not certify manual compact UX or
Windows/Linux. Screenshots, API references and scope are in
[implementation 03](settings-03.md).

## Chat reading follow-up — implementation 04

Both native targets were rebuilt, with 17 Swift and 25 Qt scenarios passing.
AppKit tests append Unicode to a real selectable NSTextView, preserve its selected
range, clamp a selection after shorter retry output and measure wrapping at two
container widths. Qt tests retain the actual TextArea identity and selection across
new chunks, assert unchanged contentY in paused reading, and test explicit return
to the end plus switching away/back without affecting the task/draft. These Qt
cases use programmatic selection/reading intent, not OS pointer gestures.

Direct SwiftUI observations: a 36-line simulated response completed; scrolling
up showed Back to latest, and activating it removed the control and returned near
the bottom. Selecting the read-only response with ⌘A also paused following. Copy
changed to its confirmation label; pasting into an empty test draft reproduced
the full 2,564-character response exactly, then that test draft was cleared.
Inspection also found a compressed model picker; removing fixedSize and giving
the native control a structural width made its selected model readable.

Qt direct checks covered Copy confirmation and pasting its response in a separate
test conversation, a 32-line response, native text selection, and Back to latest
clearing that selection. Older sample conversations/drafts were preserved.
See [implementation 04](chat-reading-04.md) for captures and limitations.

One SwiftUI automation call timed out during the long stream. A one-second sample
of the exact preview process showed an idle main event loop rather than a layout
loop, and later native inspection confirmed completed output. Resetting the UI
connection and using the bundle ID restored inspection. This is not a hang fix
or a performance pass. A full interactive selection-during-stream stress run,
screen-reader behavior and all target-OS gestures remain acceptance work.

## Remaining acceptance gates

- Windows/Linux native hosts, DPI/Wayland, platform packaging and deployment.
- Full manual 640-point layout, large OS text, high contrast, Reduce Transparency
  and Reduce Motion; complete appearance review across all native workspaces.
- Live OS appearance changes while System is selected, and host-specific Qt
  palette/shortcut integration. The Qt theme override is a platform hint.
- Full VoiceOver/Narrator/Orca traversal and live Vietnamese/Japanese IME
  composition. Search handlers defer arrow/Return commands during marked text,
  but a real IME session has not been exercised.
- SwiftUI full-library initial search focus and return to the history trigger
  after dismissal remain unconfirmed. Native popover placement at compact widths
  also requires direct screen verification; window-only captures can exclude a
  system popover extending outside its host window.
- Sleep/lock/crash/manual-storage-failure tests and large-history performance.
- All product modules beyond Chat/text Translation and basic settings; real
  provider credentials, network streaming and shared Rust core.
- Fable 5.1 cross-review after user restores Claude authentication.

Full Electron build, broad Electron tests and browser UI tests were not run:
Electron behavior was not changed, and the new native targets have their own
build/tests. Existing renderer/Electron type checks and design checks passed.
Qt/CMake installation was authorized and completed in the follow-up above.
No commit, push, release or data migration occurred.

## Foundation 05 — resumed 2026-10-27

See [foundation-05.md](foundation-05.md) for source hashes, retained logs,
CUA screenshots, passing checks and outstanding F01–F08 gates. Swift: 22 tests;
Node: 10; Qt: 49 scenarios (51 passes including init/cleanup), including 24
locale/size/theme cases. Build/test success is not full runtime/user acceptance.

Docs sync/review/check passed; 13 docs tests passed. No full Electron build/web
suite in this native-only continuation; shared renderer inputs passed type/lint/design checks.
