# ADR 001 — Native adapters for the first vertical slice

Status: provisional, limited to fake-provider implementation 01, 2026-10-26.

Amended by [Native code 32](native-code-32.md), 2026-10-27: the user's full migration
request defers testing to the user. Qt now has a C++ reducer. Real Ollama transport
is implemented in separate Swift/C++ adapters, outside both reducers; Rust/FFI
remains undecided. This supersedes the original fake-only implementation limit,
without claiming runtime or platform acceptance.

## Decision

Build a runnable SwiftUI/AppKit macOS app and a Qt Quick Windows/Linux adapter
alongside Electron. Share the versioned state contract, deterministic provider
fixtures, Unicode recovery fixture and generated locale/metric resources. Keep
platform views separate from state/persistence. Do not import renderer hooks or
Electron APIs into either native app.

The initial Swift domain and Qt pure-JavaScript reducer implement the same small
contract. This is a temporary bridge-validation seam, not an endorsement of two
permanent product cores. Choose the shared Rust ABI, cancellation delivery,
threading model and key-store adapter only after the two actual runtimes pass the
same scenarios. No real provider integration should be added independently to the
two reducers. The contract fixture does not establish binary or performance parity.

## Material and tokens

SwiftUI's standard navigation and toolbar adopt system appearance. Reading and
composing use opaque semantic text surfaces. No CSS blur or hand-built glass layer
is shipped. Qt uses standard controls/palette and OS decorations; it does not copy
macOS traffic lights or translucent reading surfaces.

`src/styles/tokens.css` remains the literal metric source. The one-way generator
reads only selected structural tokens into `native.json`; it does not replicate
colors, font sizes or control drawing. Native fonts/semantic colors and implicit
control metrics come from the platform. Both generated JSON files must be byte
identical. Edit catalogs in `src/i18n/locales/`, never in generated JSON. Geometric
ratios in native layouts are relationships between canonical metrics, not new
independent pixel scales. Each generated artifact has a freshness check.

Implementation 03 adds content-text scaling: the generator reads the existing
small/medium/large factors from `tokens.css`, while each adapter scales its system
body font. No browser font size is copied. This first setting affects reading,
composing and previews; native control labels keep the platform size. Appearance
preferences live in the same atomic preview snapshot, with defaults for older v1
files. SwiftUI uses `preferredColorScheme`; Qt uses `QStyleHints` so it can keep
the platform palette. The Qt override is a platform hint and requires host-specific
acceptance, particularly on Linux. The System option removes that override.

## Persistence and rollback

The preview apps use unique IDs/directories, with no import or overwrite of
Electron state. UI cannot supply a filesystem path or credentials. Atomic file
writes happen behind `WorkspacePersistence` / `WorkbenchBridge`; invalid schema
blocks writes, and recovery never restarts a provider call. Streaming saves are
coalesced; terminal/user actions flush. Keeping the Electron build untouched is the
rollback path. These local JSON stores are unencrypted demo storage, not a secrets
store. No telemetry or outbound network is added.

## References

- [Apple: Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
- [Apple: Build a SwiftUI app with the new design](https://developer.apple.com/videos/play/wwdc2025/323/)
- [Qt: FluentWinUI3 style](https://doc.qt.io/qt-6/qtquickcontrols-fluentwinui3.html)
- [Qt: Popup](https://doc.qt.io/qt-6/qml-qtquick-controls-popup.html)
- [Qt: JavaScript host environment](https://doc.qt.io/qt-6/qtqml-javascript-hostenvironment.html)
