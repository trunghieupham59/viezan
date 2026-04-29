# Split UI Component Report - 20260429-1739

Scope:
- React UI: `src/pages`, `src/components`
- Browser extension UI: `chrome-extension/extension-ui.css`, `chrome-extension/content.css`

Rules/workflows applied:
- `viezanagent/rule/viezan-product-engineering`
- `viezanagent/rule/generate-code`
- `viezanagent/workflow/split-ui-component`

## Summary

| Category | Before | After | Status |
|---|---:|---:|---|
| Inline SVG outside icon registry | 0 | 0 | Pass |
| React oversized radius/shadow (`rounded-2xl`, `rounded-3xl`, `shadow-xl`, `shadow-2xl`) | Found | 0 | Fixed |
| Extension decorative gradients | Found | 0 | Fixed |
| Extension radius > 10px | Found | 0 | Fixed |

## Component Map

### Reusable UI Surfaces

Centralized in `src/index.css`:
- `app-page`
- `app-workspace`
- `surface-panel`
- `surface-panel-focus`
- `surface-panel-drop`
- `surface-footer`
- `floating-panel`
- `modal-surface`
- `toolbar-icon-button`
- `toolbar-pill-button`
- `popover-title`

These classes replace repeated panel, popover, modal, toolbar, and footer styling across Translate, Chat, Live, History, Settings modal, quick chat popup, image translator, and dropdowns.

### Feature Components Kept In Place

Feature-specific components remain in their current domains:
- `src/components/chat/MessageBubble.tsx`
- `src/components/chat/SystemPromptDropdown.tsx`
- `src/components/translate/ImageTranslator.tsx`
- `src/components/live/*`

No domain component was moved into `src/components/ui/` because the refactor did not create new props-only feature-agnostic components.

## Fixed Findings

### High: Duplicate Surface Styling

Files updated:
- `src/pages/TranslatePage.tsx`
- `src/pages/ChatPage.tsx`
- `src/pages/LiveTranslatePage.tsx`
- `src/pages/HistoryPage.tsx`
- `src/components/SettingsModal.tsx`
- `src/components/AIChatPopup.tsx`
- `src/components/translate/ImageTranslator.tsx`
- `src/components/chat/SystemPromptDropdown.tsx`

Fix:
- Replaced repeated panel/popover/modal/footer class strings with shared surface classes.
- Unified app page background and workspace padding so the primary screens feel like one desktop tool surface.
- Preserved existing i18n labels and icon registry usage.

### Medium: Oversized Radius And Heavy Shadows

Files updated:
- `src/components/chat/MessageBubble.tsx`
- `src/components/ui/DragOverlay.tsx`
- `src/components/ui/ImagePreviewThumbnail.tsx`
- `src/components/ModelSelector.tsx`
- `src/components/AIChatPopup.tsx`
- `src/components/translate/ImageTranslator.tsx`
- `src/pages/LiveTranslatePage.tsx`

Fix:
- Replaced `rounded-2xl` / `rounded-3xl` with compact `rounded-lg` or shared surfaces.
- Replaced repeated heavy popover/modal shadows with shared `floating-panel` and `modal-surface`.

### Medium: Extension UI Drift

Files updated:
- `chrome-extension/extension-ui.css`
- `chrome-extension/content.css`

Fix:
- Removed decorative header gradients from popup and selection tooltip.
- Reduced options brand radius from 12px to 10px, matching the extension rule ceiling.

## Verification

Commands:

```bash
rg -n "rounded-2xl|rounded-3xl|shadow-xl|shadow-2xl" src/pages src/components -g "*.tsx"
rg -n --glob "*.tsx" "<svg" src -g "!src/components/ui/icons/**"
rg -n "linear-gradient|border-radius: 1[1-9]px|border-radius: [2-9][0-9]px" chrome-extension
npx tsc --noEmit --pretty false
npm run build
npm test -- --run src/pages/__tests__/TranslatePage.test.tsx src/pages/__tests__/ChatPage.test.tsx
```

Result:
- React UI scan: pass, no results.
- Inline SVG scan: pass, no results.
- Extension drift scan: pass, no results.
- TypeScript: pass.
- Build: pass.
- Page tests: 2 files passed, 25 tests passed.

## Remaining Risks

- This pass standardizes the UI surface system and removes obvious workflow findings. It does not redesign every feature-specific microinteraction.
- `LiveTranslatePage.tsx` remains a large file and is still a candidate for a later feature-component split.
