# macOS selection replacement verification

## Scope and evidence

The reported Chrome failure was a false success indication: translation completed,
but the selected source text remained unchanged. The previous AX path treated a
successful setter return as completion. The clipboard path returned true after
posting Command-V and waiting, without inspecting the target value.

This change is limited to macOS selection translation. Existing untracked reports
and editor configuration are preserved. No credentials, provider settings, or
workspace history files were inspected or edited directly.

## Implementation

- Capture the original AX value, focus element, application, and UTF-16 selection.
- Restrict replacement to editable text controls with writable AX values.
- Compare the resulting full value with the exact expected replacement. Poll for
  bounded asynchronous updates; missing values, unrelated edits and cancellation
  do not count as success.
- Use Command-V rather than the AX selected-text setter, and only when the captured application, element, full value,
  selected text and range still match. Never activate or paste into another app.
- Restore the clipboard only while the operation still owns its change count.
- Keep unverifiable/read-only selections in the result card with manual copying.
- Bind manual retry to the original target and the quick-translation task lifetime.

The first live revision still failed according to the user despite AX value
verification. The revised implementation therefore avoids AX writes entirely;
it also rejects unchanged model output as evidence of a replacement. Debug-only
logs record boolean/status information, never selected text or model output. The
development bundle also writes at most 60 such events to its managed build directory
for diagnostics; release bundles do not write this trace.

## Verification

- Pass: `swift test --package-path apps/macos --filter 'selectionReplacement|quickTranslate|shortcutKey'` (7 tests).
- Pass: `npm run check:resources`, `npm run check:docs`, `git diff --check`.
- Pass: development reload built, signed, and relaunched
  `.native-build/dev/Viezan.app`; reload state `complete`.
- First live revision: user reported the same false-success symptom; rejected.
- A later screenshot still showed unchanged source and zero DOM input events.
  No completed translation appeared in the OS log, so a bounded development-only
  event trace was added before drawing further conclusions about that attempt.
- Pass on the current development bundle: physical shortcut attempts in Chrome
  replaced the textarea, input, and contenteditable values with Japanese text.
  Both the accessibility tree and screenshot show all three translated values;
  the fixture reports `DOM input events: 3`. The bounded trace records three
  sequences of hotkey, captured editable target, translation, paste, verification,
  and success. This is actual document mutation evidence, not just AX setter status.
- Pending: read-only page translation/result-card behavior and TextEdit regression
  on the final build. The read-only fixture text was unchanged during the three
  editable-control tests; no separate shortcut test of that paragraph is claimed.
- Fixture: `/tmp/viezan-selection-test.html`. Automated Command-Shift-D invokes
  Chrome's bookmark-all-tabs command; physical shortcut tests supplied the live
  acceptance evidence above.
- Not run: Windows/Linux, theme/window-size/VoiceOver/IME matrices; this is a macOS
  service/state fix with no layout or token changes. No cross-platform acceptance
  is claimed. No dependency installation, commit or push.

## Capability coverage

Used `implement` / `ship-viezan-feature`, `generate-code`,
`viezan-product-engineering`, `viezan-feature-planner`, and scoped source/privacy
review from `viezan-ipc-security-audit`. Used `sync-docs` / `viezan-doc-sync` for
README and the Everywhere screen specification. The capability files retain
legacy Electron examples; source ownership follows the current native AGENTS.md.
Provider routing, locale catalog, browser extension and live-audio audit gates
were not run because those domains were not changed.

## Floating notification border follow-up

User supplied a screenshot showing a rectangular dark outline outside the rounded
notification. The panel was transparent, but its NSHostingController backing was
not explicitly non-opaque or clipped to the card silhouette.

Changed QuickTranslate to a non-opaque NSHostingView, a clear backing layer with
the same semantic corner radius as the card, and native shadow invalidation after
layout/resize. The panel remains nonactivating; action controls retain their own
keyboard focus behavior. No global focus-ring or accessibility settings changed.

Verification: `swift build --package-path apps/macos`, `npm run check:docs`, and
`git diff --check` passed. Development reload state is complete. User confirmed the rectangular black outline is gone on the reloaded development
build. Light/dark, Increase Contrast and VoiceOver matrices have not been rerun. No new unit tests for this
small rendering change; compilation does not establish compositor appearance.

Applied `viezan-native-ux` and `ui-ux-pro-max` with the current UI rules and
Everywhere spec. Targeted SwiftUI query `rounded clipping background` returned
modifier-order guidance only, not an AppKit-window diagnosis. The native SDK and
Apple's `NSWindow.invalidateShadow()` documentation informed shadow refresh;
the supplied screenshot remains the visual defect evidence.

## PR verification

Full `swift test --package-path apps/macos` passed on the final source: 49 native
UI tests in 7 suites and 90 domain tests. Resource, documentation and whitespace
checks also passed. Live acceptance and unrun platform gates remain as listed above.
