/** Renderer-side rules for recording a global shortcut, before anything reaches main. */

export interface RecordedKeyEvent {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type HotkeyRecording =
  /** Escape: stop recording without changing anything. */
  | { kind: 'cancel' }
  /** A modifier on its own, or plain Tab: keep waiting (Tab moves focus on as usual). */
  | { kind: 'ignore' }
  /** A key without Command, Control or Option/Alt: rejected, it would hijack typing. */
  | { kind: 'needs-modifier' }
  | { kind: 'accelerator'; accelerator: string }

const MODIFIER_KEYS = ['Meta', 'Control', 'Alt', 'Shift']

const KEY_MAP: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Escape: 'Escape', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab',
}

/** F1–F24 are safe on their own: they do not type text. */
const FUNCTION_KEY = /^F([1-9]|1\d|2[0-4])$/

/** Turn a keydown during recording into an Electron accelerator, or say why not. */
export function recordHotkey(event: RecordedKeyEvent): HotkeyRecording {
  const { key } = event
  if (key === 'Escape') return { kind: 'cancel' }
  if (MODIFIER_KEYS.includes(key)) return { kind: 'ignore' }
  const hasModifier = event.metaKey || event.ctrlKey || event.altKey
  if (key === 'Tab' && !hasModifier) return { kind: 'ignore' }
  if (!hasModifier && !FUNCTION_KEY.test(key)) return { kind: 'needs-modifier' }
  const parts: string[] = []
  if (event.metaKey) parts.push('Command')
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(KEY_MAP[key] ?? key.toUpperCase())
  return { kind: 'accelerator', accelerator: parts.join('+') }
}
