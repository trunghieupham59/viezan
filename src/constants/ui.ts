/**
 * UI timing constants — shared across pages and components.
 *
 * HC-03: The value 1500 (copy feedback duration) was previously hardcoded
 * independently in both TranslatePage.tsx and ChatPage.tsx.
 */

/** How long (ms) the "Copied!" feedback label is shown after a copy action.
 *  Used in TranslatePage and ChatPage to ensure consistent UX. */
export const COPY_FEEDBACK_DURATION_MS = 1_500

/**
 * Narrowest AI Translate container (px) that keeps the history panel beside the
 * workbench; below it the panel opens as a temporary overlay. Mirrors the
 * `app-main` 900px container query in translate.css.
 */
export const TRANSLATE_HISTORY_INLINE_MIN_WIDTH = 900

/** Debounce delay (ms) before auto-translating an image attachment.
 *  Images don't have typed text to debounce on, so a short fixed delay is used. */
export const IMAGE_AUTO_TRANSLATE_DELAY_MS = 300

// ─── Status / feedback reset delays ───────────────────────────────────────────

/** How long (ms) before resetting a verify status indicator back to 'idle'.
 *  Used in ApiKeyInput after showing success/rate-limited result. */
export const VERIFY_STATUS_RESET_DELAY_MS = 5_000

/** How long (ms) before resetting a short-lived UI status (e.g. hotkey "done"). */
export const STATUS_RESET_DELAY_MS = 3_000

/** How long (ms) before resetting a long-lived UI status (e.g. hotkey "error"). */
export const STATUS_RESET_LONG_MS = 5_000

/** How long (ms) before a toast / inline message auto-dismisses. */
export const TOAST_DISMISS_DELAY_MS = 4_000

/** A transient toast that offers an action (Undo, Turn back on) stays longer so it can be used. */
export const TOAST_ACTION_DISMISS_DELAY_MS = 8_000

/** Toasts shown at once; newer ones wait their turn instead of stacking up the window. */
export const TOAST_MAX_VISIBLE = 3

// ─── Live Translate ────────────────────────────────────────────────────────────

/** Minimum audio blob size (bytes) to consider worth processing.
 *  Blobs smaller than this are likely silence or encoding artefacts. */
export const MIN_AUDIO_BLOB_BYTES = 1_000

/** Default subtitle segment duration (ms) when the next segment timestamp is unknown. */
export const DEFAULT_SEGMENT_DURATION_MS = 3_000

/** Minimum subtitle segment display duration (ms) to avoid flash-of-content. */
export const MIN_SEGMENT_DURATION_MS = 500

/** Analyser RMS (byte time-domain, 0–128) shown as a full input-level meter.
 *  Speech thresholds in vadPolicy sit around 8–18, so normal speech fills about half. */
export const LIVE_INPUT_LEVEL_FULL_SCALE_RMS = 40

/** How often (ms) the live input-level meter samples the analyser. */
export const LIVE_INPUT_LEVEL_POLL_MS = 100

/** Distance (px) from the bottom within which a live transcript keeps following new text. */
export const LIVE_FOLLOW_LATEST_THRESHOLD_PX = 48

/**
 * Fired on `window` after a global shortcut (Quick Translate, Launcher) is saved,
 * so every view that lists shortcuts or background status re-reads them at once
 * instead of waiting for the next window focus.
 */
export const SHORTCUTS_CHANGED_EVENT = 'viezan:shortcuts-changed'
