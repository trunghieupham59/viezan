# Native migration — Foundation 06

Scope: macOS foundation only; Home not started. Preserve existing dirty work.

Qt dark toolbar/command icon contrast fixed using semantic palette colors.
Added mounted SwiftUI, AppKit marked-text/lifecycle and Qt preedit/blocked-load
regressions. Swift 27 tests, Qt 53 passes (51 scenarios), shared contract 10 tests,
Atomic/Design, docs sync/review/check and 13 docs tests pass.

CUA confirms system-theme live updates and opaque Reduce Transparency fallback.
Reduce Motion smoke tested. System settings restored to their initial values.
144 isolated SwiftUI renders recorded; these do not replace native-window QA.
True VI/JA input and VoiceOver speech/traversal are not certified: source switching
through CUA did not produce composition and SystemUIServer access timed out.

Detailed evidence, commands and remaining macOS gates:
`docs/migration/native-implementation/foundation-06.md`.
Foundation remains IN PROGRESS; no commit, push, release, dependency installation.
