# 15 — Testing

Viezan uses **Vitest 4** with `jsdom` for renderer specs and Node for IPC specs. Testing Library powers component tests.

## Layout

```
src/
├── __tests__/                        Top-level App spec
├── components/__tests__/             Component-level specs
├── hooks/__tests__/                  Hook specs
├── hooks/live/__tests__/             Live-helper specs
├── pages/__tests__/                  Page-level specs
├── services/__tests__/               Service specs
├── store/__tests__/                  Store / slice specs
├── utils/__tests__/                  Utility specs
└── test/setup.ts                     Vitest setup (jsdom matchers, window.api stubs)

electron/ipc/__tests__/               IPC + provider routing specs
electron/ipc/__tests__/helpers/       Shared mocks (e.g. mockIpcMain.ts)
```

## Configuration

- `vitest.config.ts` — `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, alias `@/` → `src/`.
- `src/test/setup.ts` — registers `@testing-library/jest-dom` matchers and stubs `window.api` so renderer specs don't need a live preload.
- Coverage is opt-in: `npm run test:coverage`.

## Commands

```bash
npm test                    # Run once
npm run test:ui             # Vitest interactive UI
npm run test:coverage       # Run with coverage report

npm test -- --run           # Force a single non-watch run
npm test -- src/hooks       # Filter to a path
npm test -- -t "translate"  # Filter to a test name
```

## What Is Covered

| Area | Examples |
|---|---|
| **IPC handlers** | `translate.test.ts`, `chat.test.ts`, `imageTranslate.test.ts`, `tts.test.ts`, `localAi.test.ts`, `localServer.test.ts`, `providers.test.ts`. Asserts routing, validation, error mapping. |
| **Helpers** | `retry.test.ts`, `errorUtils.test.ts`, `validation.test.ts`, `translateHelpers.test.ts`, `constants.test.ts`. |
| **Store slices** | `coreSlice.test.ts`, `settingsSlice.test.ts`, `historySlice.test.ts`, `useAppStore.test.ts`. |
| **Hooks** | `useTTS.test.tsx`, `useTypewriter.test.ts`. |
| **Live pipeline pure helpers** | `transcriptAssembly.test.ts`, `speakerDiarization.test.ts`. |
| **Services** | `translationService.test.ts`. |
| **Pages** | `TranslatePage.test.tsx`, `ChatPage.test.tsx`, `App.test.tsx`. |
| **Components** | `AIChatPopup.test.tsx`. |
| **Utils** | `canvas`, `imageUtils`, `keyboardShortcuts`, `live-translate`, `locale`, `markdownInline`, `modelDisplay`, `tpl`. |

## Patterns

### Mocking `window.api`

`src/test/setup.ts` provides a default stub. Override per-test with `vi.spyOn(window.api, 'translate')` or by replacing the global before mount:

```ts
beforeEach(() => {
  window.api = {
    ...window.api,
    translate: vi.fn().mockResolvedValue({ success: true, translatedText: 'xin chào' }),
  } as any
})
```

### Mocking the SDKs in IPC specs

Each provider module imports its SDK at top level. Tests mock the SDK with `vi.mock('openai', …)` etc. The `mockIpcMain.ts` helper builds a fake `ipcMain` so handler registration can be exercised without Electron.

### Testing async streams

For streaming channels, the test calls the handler directly and asserts that `onDelta` was called with the right chunks, then that the final return value matches the concatenation. Helpers in `translateProviders.test.ts` show the pattern.

### Testing the store

Use `useAppStore.setState({...})` and `useAppStore.getState()` directly. For React-tree behavior, render a tiny consumer and assert the rendered state. Reset the store between tests with `useAppStore.setState(initialState, true)` if you mutate persistent fields.

## Authoring New Tests

1. Co-locate under the `__tests__/` directory next to the file you're testing.
2. Name files `*.test.ts` (Node) or `*.test.tsx` (React).
3. Prefer **behavioral tests** over implementation tests — assert what the user/caller sees, not internal calls.
4. For IPC specs:
   - Mock the SDK / fetch layer at module level (`vi.mock`).
   - Build a payload, call the handler function exported from the module (or via `mockIpcMain`).
   - Assert `{ success, ... }` envelope and any forwarded events.
5. For renderer specs:
   - Use Testing Library queries by role/label/text.
   - Mock `window.api` per test.
   - For pages with timers (debounce, typewriter), use `vi.useFakeTimers()` and `vi.runAllTimersAsync()`.

## Coverage Goals

There is no enforced threshold yet, but the working target is:

- **IPC + providers**: ≥80% lines, with explicit specs for routing, validation and error classification.
- **Store slices**: ≥85% lines.
- **Live helpers + utils**: ≥85% lines (they're pure).
- **Pages / components**: smoke + critical paths, not exhaustive.

## When To Add A Test

- New IPC channel → handler spec + provider routing spec.
- New provider → adapter spec asserting payload shape, error classification and abort behavior.
- New store action → slice spec.
- New live-pipeline helper → pure-function spec.
- Bug fix → regression spec that fails before the fix.

## Skipped / Hard-To-Test Areas

- Realtime audio capture (`useLiveTranslate.ts`) — the hook is too heavy for unit tests; helpers are split out and tested individually.
- Electron lifecycle (`main.ts`) — covered by manual smoke during release readiness.
- Auto-updater — covered by manual end-to-end on a staged release channel.

These are tracked by the `audit-live-perf` and `release-readiness` workflows as manual checklist items.
