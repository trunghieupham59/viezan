# Review 06 — source-aligned macOS materials

Status: proposed design, user acceptance pending. No production files changed.

## Source trace

| Source | Observed contract | Prototype change |
| --- | --- | --- |
| src/styles/tokens.css:608–713, 714 onward | Glass has separate primary/context/titlebar/overlay material, highlight, blur, shape and type tokens | Scope the existing Glass preset to sidebar, toolbar, work strip and floating layers. Keep the main content under Graphite so reading surfaces stay stable. |
| electron/main.ts:95,155,187 | Electron uses under-window vibrancy with followWindow | Browser materials are an approximation, not native Liquid Glass or an OS implementation. |
| src/constants/themePresets.ts; electron/windowPalette.ts | nativeMaterial/material traits gate the window material | Apply this new treatment only to macOS; remove scoped theme attributes on Windows/Linux. |
| PrimaryNavigationSidebar.tsx | 900 breakpoint; primary nav separate from context; sm controls | macOS navigation uses sm token sizing and keeps 60/236 layout roles. |
| AIChatSidebar.tsx:240–280 | History toggle and New Chat in header, keyboard hint, separate sidebar | Sidebar icon for history, new-chat shortcut hint and handler; switching sessions keeps desktop history open, compact selection dismisses it. |
| src/pages/ChatPage.tsx:1509–1587 | One composer with tools/actions | Preserve one stable composer; shared md heights; blank Send uses native disabled state. |
| tokens.css:1460 onward; codex.css:625–658 | Reduced-transparency/contrast support; stronger floating materials | Solid fallbacks for sidebar/toolbar/history/popovers; no blur in reduced mode; media-query fallback and reduced-motion override. |

The imported token snapshot is byte-identical to source at review time (SHA-1 f98b03e8672ffb02780b16cedf44329d944bd5d8). No parallel literal material palette was introduced. New CSS references the source snapshot tokens.

## Apple guidance

https://developer.apple.com/design/human-interface-guidelines/materials

Apple distinguishes Liquid Glass for controls/navigation from standard content materials, asks for restrained custom effects and recommends regular material for common use. This proposal follows that layer separation. It does not claim to reproduce native refraction, dynamic luminance adaptation, inactive-window behavior or macOS 27 pixel parity. A SwiftUI/AppKit build is still needed for those judgments.

## Evidence and validation

1. `19-review06-macos-light.png`: separate primary/context/content surfaces, readable messages, one composer. Source-derived material values.
2. `20-review06-macos-dark-overlay.png`: activity panel above content, stronger material prevents readable text bleeding through.
3. `21-review06-reduced-transparency.png`: manual reduced-transparency toggle switches navigation and overlay to solid backgrounds.
4. Send enabled with typed content and disabled for empty content, observed through browser control state.

Node syntax, check:atomic and check:design passed. Automated checks scan product code, not browser design quality. Full application build and runtime suite not run because only isolated prototype artifacts changed. Real OS accessibility preferences, VoiceOver, IME, native optical effect, macOS version parity, all locales, and inactive-window behavior remain NOT RUN. Keyboard shortcut handler is implemented; native/browser shortcut arbitration remains unverified.
