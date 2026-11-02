# Live Translate Performance / Lifecycle Report - 2026-05-01 18:22

Workflow: `audit-live-perf`
Scope: `src/hooks/useLiveTranslate.ts`, `src/pages/LiveTranslatePage.tsx`, `electron/ipc/transcribe.ts`, `electron/ipc/translate.ts`, `electron/ipc/subtitle.ts`.

## Pipeline Map

| Stage | Files | Status |
|---|---|---|
| Audio capture | `useLiveTranslate.ts` | Pass: tracks and audio context are closed in stop cleanup. |
| VAD | `useLiveTranslate.ts`, `vadPolicy.ts` | Pass: energy/Silero paths have timer/VAD cleanup. |
| STT | `electron/ipc/transcribe.ts` | Pass with log noise follow-up. |
| Filters / sentence boundary | `src/utils/live-translate.ts`, hook helpers | Pass. |
| Translation | `electron/ipc/translate.ts`, hook background calls | Pass. |
| Subtitle overlay | `electron/ipc/subtitle.ts`, hook listeners | Pass. |
| Live history | `historySlice.ts`, hook session save | Pass. |

## Lifecycle Verdict

| Check | Verdict |
|---|---|
| AudioContext close | Present in `handleStop`. |
| MediaStream stop | Present in `handleStop`. |
| MediaRecorder stop | Present when recording. |
| VAD interval cleanup | Present via `vadTimerRef`. |
| mountedRef guard | Present for async callbacks and unmount cleanup. |
| Subtitle IPC listener cleanup | Present; cleanup callbacks are returned from `useEffect`. |

## Findings

| Severity | Stage | Issue | Fix |
|---|---|---|---|
| Medium | Maintainability | `useLiveTranslate.ts` is ~1.5k lines and `LiveTranslatePage.tsx` is ~1k lines. | Continue extracting pure hooks/components around summary, subtitle controls, and capture setup. |
| Medium | STT logs | `electron/ipc/transcribe.ts` has many `console.log` recovery/hedge diagnostics. | Gate verbose logs behind a debug flag before release if terminal noise matters. |
| Low | Manual QA gap | Automated tests cannot validate real mic/system-audio lifecycle. | Run manual start/stop, language switch, audio source switch, subtitle show/hide. |

## Tunable Constants

Current threshold constants are centralized enough for this pass. Keep future changes in constants/helper modules instead of inline page controls.

## Verification

| Command | Result |
|---|---|
| `npx tsc --noEmit --pretty false` | Pass |
| `npx tsc -p tsconfig.electron.json --noEmit --pretty false` | Pass |
| `npm test -- --run` | Pass |
| `npm run build` | Pass |

Manual smoke not run: real microphone/system-audio behavior requires interactive QA.

