# Split UI Component Report - 2026-05-01 18:22

Workflow: `split-ui-component`
Scope: `src/components`, `src/pages`, `chrome-extension`

## Component Map

### Reusable

| Area | Status | Notes |
|---|---|---|
| `src/components/ui/` | Good | Button/toggle/action primitives exist and use icon registry. |
| `src/components/ui/icons/` | Good | Inline SVG is centralized here as allowed. |
| Root reusable components | Good | `Sidebar`, `AppLogo`, `MarkdownText`, `ModelSelector` are domain-aware but reusable enough for app shell. |

### Feature Specific

| Area | Status | Notes |
|---|---|---|
| `src/components/translate/` | Good | Translate-specific controls are already split. |
| `src/components/chat/` | Good | Chat message/system prompt/deep research components are separated. |
| `src/components/live/` | Good | Live rows/badges are split from page. |
| `src/pages/settings/*Section.tsx` | Mixed | Sections are split, but STT/TTS duplicate small provider-frame UI. |

## Findings

| Severity | Type | File | Issue | Fix |
|---|---|---|---|---|
| Medium | Large inline feature component | `src/pages/settings/ApiKeysSection.tsx:17` | `LocalAiProviderCard` is large and mixes runtime install, benchmark, download, and status UI. | Split into `LocalRuntimeStatus`, `LocalModelList`, `LocalRuntimeInstaller` when touching local AI settings next. |
| Medium | Duplicate UI pattern | `src/pages/settings/SttSection.tsx`, `src/pages/settings/TtsSection.tsx` | `ProviderLogoFrame` is duplicated. | Extract shared settings provider frame after another repeat or during settings cleanup. |
| Low | Large popup subcomponents | `src/components/AIChatPopup.tsx:730` | Q&A card helpers are local and coherent, but the file remains dense. | Keep for now; extract only if popup grows again. |
| Low | Extension visual duplication | `chrome-extension/*.css`, `popup.js`, `content.js` | Extension uses separate CSS and JS literals for similar provider/status UI. | Consider shared extension theme/helper file. |

## Icon / Emoji Checks

| Check | Result |
|---|---|
| Inline SVG outside `src/components/ui/icons/**` | Pass |
| Icon library imports outside registry | Pass |
| Emoji rendered as UI icon | Low residual: search/web and status glyphs remain in comments or status text; no release blocker. |

## Action Plan

1. Do not split more UI immediately; current high-risk icon hardcode class is clean.
2. Next settings refactor: extract repeated provider frame from STT/TTS.
3. Next local AI settings change: split `LocalAiProviderCard`.
4. Next extension UX pass: centralize provider/status labels and colors.

## Verification

| Command | Result |
|---|---|
| `rg '<svg' src -g '!src/components/ui/icons/**'` | Pass |
| `rg "from ['\\\"](lucide-react\|react-icons...)" src` | Pass |
| `npm run build` | Pass |

