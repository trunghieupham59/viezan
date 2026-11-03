# Glass button material throughout Viezan

Date: 2026-11-03. This is a local implementation and verification report,
not release or user acceptance evidence.

## Request and diagnosis

The user rejected the previous button treatment as not glass and explicitly
expanded the scope to the whole app. The earlier Chat treatment painted an
opaque face with a fine illuminated rim. That face hid the backdrop, and some
native actions still bypassed the shared style. A passing layout test did not
resolve this visual defect.

The reference buttons have a clear capsule silhouette, translucent body,
directional edge reflections, and separate emphasis for selected/primary
controls. The Chat reference groups model and voice under one lens; its plus
and Send actions sit separately. Viezan retains the current cyan shell,
semantic accent, real model labels and desktop dimensions.

## Implementation

- SwiftUI `ControlGlass` applies native `glassEffect` to the complete control
  on macOS 26+. The shared primary, outline and quiet styles use it in the
  Glass preset. There is no opaque button fill above the material.
- AppKit toolbar and panel actions use `NSGlassEffectView` beneath the same
  existing `NSButton`. Neutral, primary and destructive roles retain their
  native activation, focus and disabled behavior. Disabled borrowed children
  keep a clear face; their parent owns the glass.
- macOS 15 neutral controls use thin material. The older-system primary
  fallback retains the opaque semantic action color to protect white-label
  contrast. Reduce Transparency / Increase Contrast use solid surfaces and
  explicit boundaries. Keyboard focus stays distinct from selection.
- Shared styles cover Home actions, Chat, Translation, Interpretation,
  Dictionary, utility actions, Settings, and auxiliary Quick Chat/translation/
  subtitle windows. Explicit bypasses such as icon menus, shortcut editing,
  research disclosure, sidebar search and selected Settings navigation were
  routed through the material. Native OS window controls, switches, pickers,
  menus and file dialogs retain their system semantics.
- Chat plus/Send/Stop and selected model rows use the material; model and
  recording borrow one outer group. SwiftUI filters use one shared surface.
  Editor and reading surfaces remain stable and opaque. Content/history rows
  keep their existing list presentation.
- Qt uses a shared translucent control face, asymmetric upper/lower rim,
  inner shade and a bounded local shadow. Accelerated rendering samples only
  a sibling face; the software path uses vector edges. It does not sample its
  parent recursively or implement desktop backdrop blur/refraction.
- Qt action buttons, tool buttons and dropdown triggers use shared primitives;
  popup selection/content stay native. App-owned dialogs use a native
  `DialogButtonBox` footer with a glass button delegate, retaining standard
  roles, ordering and accepted/rejected signals. Hover/pressed tint remains
  visible in software rendering. OS dialogs remain native. There are no new
  dependencies or service changes.
- The Qt model configuration dialog was discovered clipped against the bottom
  composer during capture. It now uses the window overlay with centered,
  bounded placement; its owner, draft and accept handlers are retained.

This pass used `viezan-native-ux`, its UI UX Pro Max adapter and the installed
UI UX Pro Max query `Liquid Glass buttons --domain style -n 1`, under the
native-migration workflow. Apple API behavior was checked against the SDK and
the official [custom glass guide](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
and [NSGlassEffectView documentation](https://developer.apple.com/documentation/appkit/nsglasseffectview).
No install, commit, push or publication was performed. Unrelated dirty work
was preserved. Shared tokens/locales were not changed in this material pass.

## Verification

- Source review found and resolved an opaque disabled child over Chat's group,
  a missing sidebar-search material, unstyled auxiliary-window actions, an
  older-system primary contrast issue and an older-system focus-ring gap.
- Final Swift sequential run: **46 native tests in 5 suites and 59 domain
  tests passed**. Log: `/private/tmp/viezan-all-buttons-swift-final.log`.
  Tests cover native material ownership, unchanged button activation/focus,
  disabled borrowed controls, four solid-fallback role cases, navigation and
  existing composer/session/layout regressions. Three opt-in render cases
  were skipped. Two previously known image failures remain excluded and
  unresolved: `composerPasteHandsImagesToTheIntakeInsteadOfTheText` and
  `pastedImageBytesIngestLikeAFileAndRejectNonImages`. This is not an unfiltered
  all-green suite.
- Generated resources: passed, 3 locales and 58 metrics. Node domain/contracts:
  11/11 passed. Native Python tooling: 7/7 passed.
- macOS dev bundle reloaded successfully with request
  `4B18C8C2-6314-4459-8B18-596F3D08CC62`. Live inspection confirmed glass faces
  and edge lighting on Translation toolbar/language/model/footer actions,
  Chat plus/model/record group, Home quick actions/filter group, and Settings
  actions/selected category/sidebar search. Down in the model panel displayed
  the keyboard outline; Escape
  returned focus to its model trigger. No AI request or recording was started
  and no model/provider/appearance preference was changed during this review.
  Sidebar search also passed Tab → Space → command palette → Escape, restoring
  keyboard focus to the search button. The app is left on AI Chat.
- Qt application and test targets built on macOS. **61 focused checks passed**
  with no QML warnings; expected microphone-permission warnings from the
  unbundled test process remain. Tests include Chat state/layout and model IDs,
  dialog OK/Cancel activation across preset changes, dropdown behavior, and
  model-dialog bounds/content at 640×480, 820×820 and 1200×820.
  **38 synthetic captures completed** across light/dark, Chat 640/820/1200,
  Home/Settings/Translation/Interpretation 820/1200, and the model dialog.
  Source and image review confirmed the final dialog is centered with its
  content and footer visible. The tested Qt rendering path is software;
  the offscreen Metal attempt reported no MTLDevice.
  Evidence: `/private/tmp/viezan-button-glass-evidence/qt/`, especially
  `final-focused.txt`, `build.log`, `capture-results.txt`,
  `source-manifest.txt` and `source-fingerprint.txt`.
- Documentation reference validation and `git diff --check` passed.

Live macOS material was inspected separately because AppKit cache captures
omit compositor effects. Inactive windows reduce native material emphasis;
active and inactive views are not visually identical. Windows/Linux runtime,
Qt GPU rendering, macOS 15 runtime, live IME/VoiceOver and the complete
locale/text-size/optional-accent matrix remain unverified in this round.
Synthetic resize and focus checks do not replace those gates. User visual
acceptance remains pending.
