# Dictionary Hardcode Report - 2026-05-04 13:23

Workflow: `check-dup-hardcode`
Scope:

- `src/pages/DictionaryPage.tsx`
- `src/components/dictionary/*`
- `src/services/dictionaryService.ts`
- `src/store/slices/dictionarySlice.ts`
- `src/i18n/types.ts`
- `src/i18n/locales/{en,vi,ja}.ts`

Mode: targeted hardcode audit for the Dictionary screen, followed by focused remediation.

## Summary

| Category | Status | Notes |
|---|---|---|
| Hardcoded credentials | Clean | No credential assignment literals in dictionary scope. |
| Hardcoded URLs | Clean | No URL literals in dictionary scope. |
| Magic timeout / port / limit call literals | Clean | Existing dictionary limits are named constants. |
| Inline SVG outside icon registry | Clean | Dictionary screen imports icons from `src/components/ui/icons`. |
| Direct external icon imports | Clean | No `lucide-react`, `react-icons`, `@heroicons`, or `@phosphor-icons` imports. |
| Emoji-as-icon in UI | Fixed | Empty-state hint emoji were replaced with icon-registry components. |
| User-facing text outside i18n | Fixed | Empty-state hints and filtered-empty text now come from locale keys. |

## Findings Fixed

### [Fixed] Empty-state hint emoji hardcode

File:

- `src/components/dictionary/DictionaryEmptyState.tsx`

Issue:

- The empty state rendered emoji literals as hint icons (`📘`, `🌏`, `💡`). The hardcode workflow treats emoji used as UI icons as an icon-hardcode smell.

Change:

- Replaced emoji literals with existing registry icons: `BookIcon`, `TranslateIcon`, and `LightbulbIcon`.

### [Fixed] Empty-state hint text outside locale source

Files:

- `src/components/dictionary/DictionaryEmptyState.tsx`
- `src/i18n/types.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/vi.ts`
- `src/i18n/locales/ja.ts`

Issue:

- The hint terms were visible UI content stored inside the component.

Change:

- Added `dictionary_empty_hints` to the translation contract and all three locale files.

### [Fixed] Filtered-empty state used a hardcoded dash

Files:

- `src/components/dictionary/DictionaryHistoryPanel.tsx`
- `src/i18n/types.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/vi.ts`
- `src/i18n/locales/ja.ts`

Issue:

- Filtering history with no matches displayed a hardcoded `—`.

Change:

- Added `dictionary_no_matches` to the translation contract and all three locale files.

### [Fixed] Dictionary service translation sanitizer type error

File:

- `src/services/dictionaryService.ts`

Issue:

- `npx tsc --noEmit --pretty false` failed because `cleanTranslationArray()` inferred a nullable array element type before filtering.

Change:

- Annotated the map callback return type as `DictionaryTranslation | null`.

## Verification

```bash
npm exec --package @biomejs/biome@2.4.13 -- biome check --write src/components/dictionary/DictionaryEmptyState.tsx src/components/dictionary/DictionaryHistoryPanel.tsx src/services/dictionaryService.ts src/i18n/types.ts src/i18n/locales/en.ts src/i18n/locales/vi.ts src/i18n/locales/ja.ts
npx tsc --noEmit --pretty false
npm test -- --run src/pages/__tests__/DictionaryPage.test.tsx src/services/__tests__/dictionaryService.test.ts src/store/__tests__/dictionarySlice.test.ts
rg -n --glob '*.{ts,tsx,js}' "(api[_-]?key|secret|password|token|credential)\s*=\s*['\"][^'\"]{8,}" src/pages/DictionaryPage.tsx src/components/dictionary src/services/dictionaryService.ts src/store/slices/dictionarySlice.ts
rg -n --glob '*.{ts,tsx,js}' "['\"]https?://[^'\"]+['\"]" src/pages/DictionaryPage.tsx src/components/dictionary src/services/dictionaryService.ts src/store/slices/dictionarySlice.ts
rg -n --glob '*.{ts,tsx,js}' "(setTimeout|setInterval|port|limit|size|delay)\s*[,(]\s*[0-9]{3,}" src/pages/DictionaryPage.tsx src/components/dictionary src/services/dictionaryService.ts src/store/slices/dictionarySlice.ts
rg -n --glob '*.{tsx,ts}' '<svg' src/pages/DictionaryPage.tsx src/components/dictionary src/services/dictionaryService.ts src/store/slices/dictionarySlice.ts
rg -n --glob '*.{ts,tsx}' "from ['\"](lucide-react|react-icons|@heroicons|@phosphor-icons)" src/pages/DictionaryPage.tsx src/components/dictionary src/services/dictionaryService.ts src/store/slices/dictionarySlice.ts
rg -n "📘|🌏|💡|[😀-🙏🌀-🗿🚀-🛿☀-⛿✀-➿]" src/pages/DictionaryPage.tsx src/components/dictionary
```

Results:

- Biome changed-file check: passed.
- Renderer TypeScript: passed.
- Dictionary tests: 3 files passed, 16 tests passed.
- Credential, URL, magic-call, inline-SVG, external-icon-import, and emoji scans: clean.

## Remaining Items

No actionable hardcode finding remains in the Dictionary screen scope.
