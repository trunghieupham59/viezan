# Live Translate Pipeline Architecture

Live Translate is still orchestrated by `src/hooks/useLiveTranslate.ts`, but focused helpers now own policy and text assembly details.

## Current Flow

1. Capture microphone, system audio, or mixed audio.
2. Apply source-aware VAD policy from `src/hooks/live/vadPolicy.ts`.
3. Queue audio chunks and transcribe through the configured STT backend.
4. Filter hallucinations, low-confidence output, duplicate text, and abnormal word rates.
5. Assemble raw transcript and completed sentence units through `src/hooks/live/transcriptAssembly.ts`.
6. Assign speaker labels based on silence gaps and recent speaker turn history.
7. Add transcript segments immediately and translate each sentence in the background.
8. Stream or push subtitle updates when floating subtitles are enabled.
9. Run post-session AI actions through `src/hooks/live/useLiveAiActions.ts`.

## Helper Responsibilities

- `vadPolicy.ts`
  - VAD thresholds, gain constants, adaptive VAD evaluation constants, and initial policy selection.

- `transcriptAssembly.ts`
  - Raw transcript trimming.
  - Whisper verbose segment normalization.
  - Pending-buffer sentence completion and force-flush behavior.

- `speakerDiarization.ts`
  - Silence-gap speaker switching.
  - Two-speaker alternation.
  - Long-pause new-speaker detection.
  - Speaker cap and least-recently-used label recycling.

- `useLiveAiActions.ts`
  - Shared loading/error/session-history flow for summarize, speaker analysis, action items, and decisions.

## Next Split Candidates

- Audio capture setup and stream mixing.
- Chunk queue processing and stale chunk discard policy.
- Subtitle source/translation synchronization.

Each future split should move one state machine at a time and include a focused unit test before changing UI behavior.
