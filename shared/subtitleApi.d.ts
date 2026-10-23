/**
 * Subtitle overlay API — the floating subtitle window shown above all OS windows during
 * live interpretation. The main renderer pushes text, style and session state; the
 * subtitle window sends user actions back. Single source for `window.api.subtitle`.
 */

export interface SubtitleStyle {
  /** Hex color for subtitle text, e.g. '#ffffff'. */
  textColor: string
  /** Font size in pixels. */
  fontSize: number
  /** Background opacity percentage (0–100). */
  bgOpacity: number
}

export interface SubtitleSessionState {
  selectedProvider: string
  selectedModel: string
  isActive: boolean
  isTranscribing: boolean
  isTranslating: boolean
  availableModels: { id: string; name: string }[]
  audioMode: string
  targetLang: string
  locale?: string
}

export interface SubtitleApi {
  /** Create and show the subtitle window (bottom-centre of the primary display). */
  show: () => Promise<void>
  hide: () => Promise<void>
  /** Push a translated sentence. */
  update: (text: string, isTranslating: boolean) => Promise<void>
  setStyle: (style: SubtitleStyle) => Promise<void>
  /** Push the latest raw (source) text shown above the translation. */
  setSourceText: (text: string, segId?: string) => Promise<void>
  pushState: (state: SubtitleSessionState) => Promise<void>
  /** Fired when the subtitle window closes (✕ or programmatically). */
  onClosed: (callback: () => void) => () => void
  onStart: (callback: () => void) => () => void
  onStop: (callback: () => void) => () => void
  onSetProvider: (callback: (provider: string) => void) => () => void
  onSetModel: (callback: (model: string) => void) => () => void
  onSetAudioMode: (callback: (mode: string) => void) => () => void
  onSetTargetLang: (callback: (lang: string) => void) => () => void
  onStyleUpdate: (callback: (style: SubtitleStyle) => void) => () => void
  /** "New session / clear" requested from the subtitle window. */
  onClear: (callback: () => void) => () => void
}
