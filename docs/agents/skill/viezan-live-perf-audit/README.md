# Skill: viezan-live-perf-audit

Skill audit hiệu năng và lifecycle của pipeline Live Translate trong Viezan: từ audio capture → VAD → Whisper → filter → sentence boundary → streaming translate → subtitle window.

## Khi dùng

```text
Dùng skill viezan-live-perf-audit để review thay đổi useLiveTranslate.ts.
```

```text
Dùng skill viezan-live-perf-audit để kiểm tra leak/lag pipeline live trước release.
```

## Pipeline stages

1. Audio Capture (`useLiveTranslate.ts`, `src/components/live/`)
2. VAD 3-gate (`useLiveTranslate.ts`, `public/vad/`)
3. Whisper STT (`useLiveTranslate.ts`, `electron/ipc/transcribe.ts`)
4. Hallucination + Duplicate filter
5. Sentence boundary detection
6. Background translation (`electron/ipc/translate.ts`)
7. Subtitle overlay (`electron/ipc/subtitle.ts`, `public/subtitle.html`)
8. Live session history (`src/store/slices/historySlice.ts`)

## Output chuẩn

```markdown
## Pipeline Map
| Stage | Files | Status |

## Findings
| Severity | Stage | Issue | Fix |

## Lifecycle Verdict
- AudioContext close:
- MediaStream stop:
- mountedRef guard:
- IPC listener cleanup:

## Performance Verdict
- Throttle/debounce streaming:
- Heavy ops on main thread:
- Confidence gating:

## Required Fixes
1. ...

## Tunable Constants Suggestion
- ...
```

## Checklist nhanh

- AudioContext, MediaStream, MediaRecorder có dispose không?
- mountedRef có chặn setState sau unmount không?
- Confidence gate Whisper có đầy đủ không?
- Streaming token có throttle không?
- Subtitle window có unsubscribe IPC khi tắt không?
- Threshold magic number có nằm trong constants không?
