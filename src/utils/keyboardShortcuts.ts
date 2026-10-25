import type { ChatSendShortcut } from '../types'

export const DEFAULT_CHAT_NEW_SESSION_SHORTCUT = 'CommandOrControl+N'
export const DEFAULT_CHAT_SEND_SHORTCUT: ChatSendShortcut = 'enter'
/** What Settings shows for Quick Translate before the user records a shortcut. */
export const DEFAULT_QUICK_TRANSLATE_SHORTCUT = 'Alt+T'

/** What Settings shows for the Launcher before the user records a shortcut. */
export function defaultLauncherShortcut(platform?: string): string {
  return platform === 'darwin' ? 'Command+Space' : 'Alt+Space'
}

type KeyboardLikeEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

const KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Escape',
  Enter: 'Enter',
  Return: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Space: 'Space',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
}

const MODIFIER_KEYS = new Set(['Meta', 'Command', 'Control', 'Ctrl', 'Alt', 'Option', 'Shift'])

function isMacPlatform(platform?: string) {
  return platform === 'darwin'
}

function normalizeShortcutKey(key: string): string {
  const mapped = KEY_MAP[key]
  if (mapped) return mapped
  return key.length === 1 ? key.toUpperCase() : key
}

function normalizeShortcutPart(part: string): string {
  const trimmed = part.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'cmd' || lower === 'command' || lower === 'meta') return 'Command'
  if (lower === 'control' || lower === 'ctrl') return 'Ctrl'
  if (lower === 'option' || lower === 'alt') return 'Alt'
  if (lower === 'shift') return 'Shift'
  if (lower === 'commandorcontrol' || lower === 'cmdorctrl') return 'CommandOrControl'
  return normalizeShortcutKey(trimmed)
}

export function keyEventToAccelerator(e: KeyboardLikeEvent): string {
  const parts: string[] = []
  if (e.metaKey) parts.push('Command')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (MODIFIER_KEYS.has(e.key)) return ''
  parts.push(normalizeShortcutKey(e.key))
  return parts.join('+')
}

export function formatShortcutLabel(shortcut: string, platform?: string): string {
  if (!shortcut) return ''
  const isMac = isMacPlatform(platform)
  return shortcut
    .split('+')
    .map((part) => {
      const normalized = normalizeShortcutPart(part)
      if (normalized === 'CommandOrControl') return isMac ? 'Cmd' : 'Ctrl'
      if (normalized === 'Command') return 'Cmd'
      if (normalized === 'Enter') return 'Enter'
      return normalized
    })
    .join('+')
}

export function eventMatchesShortcut(e: KeyboardLikeEvent, shortcut: string, platform?: string): boolean {
  if (!shortcut) return false

  const parts = shortcut.split('+').map(normalizeShortcutPart).filter(Boolean)
  const key = parts.find((part) => !['Command', 'Ctrl', 'Alt', 'Shift', 'CommandOrControl'].includes(part))
  if (!key) return false

  const wantsCommandOrControl = parts.includes('CommandOrControl')
  const wantsCommand = parts.includes('Command')
  const wantsCtrl = parts.includes('Ctrl')
  const wantsAlt = parts.includes('Alt')
  const wantsShift = parts.includes('Shift')
  const isMac = isMacPlatform(platform)

  const expectedMeta = wantsCommand || (wantsCommandOrControl && isMac)
  const expectedCtrl = wantsCtrl || (wantsCommandOrControl && !isMac)

  return (
    e.metaKey === expectedMeta &&
    e.ctrlKey === expectedCtrl &&
    e.altKey === wantsAlt &&
    e.shiftKey === wantsShift &&
    normalizeShortcutKey(e.key) === key
  )
}

type ChatSendKeyEvent = KeyboardLikeEvent & Partial<Pick<KeyboardEvent, 'isComposing' | 'keyCode'>>

export function shouldSendChatMessage(e: ChatSendKeyEvent, shortcut: ChatSendShortcut, platform?: string): boolean {
  // Enter that confirms an IME candidate (Vietnamese, Japanese) belongs to the
  // input method, not the composer. keyCode 229 covers the composition-end key.
  if (e.isComposing || e.keyCode === 229) return false
  if (shortcut === 'modEnter') {
    return eventMatchesShortcut(e, 'CommandOrControl+Enter', platform)
  }

  return e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
}

/**
 * One comparable form of an accelerator on this platform: `CommandOrControl`
 * resolved to Command or Ctrl, modifiers in a fixed order, the key normalized.
 * Two shortcuts collide exactly when their canonical forms are equal.
 */
export function canonicalShortcut(shortcut: string, platform?: string): string {
  if (!shortcut) return ''
  const isMac = isMacPlatform(platform)
  const parts = shortcut.split('+').map(normalizeShortcutPart).filter(Boolean)
    .map((part) => part === 'CommandOrControl' ? (isMac ? 'Command' : 'Ctrl') : part)
  const order = ['Command', 'Ctrl', 'Alt', 'Shift']
  const modifiers = order.filter((modifier) => parts.includes(modifier))
  const keys = parts.filter((part) => !order.includes(part))
  return [...modifiers, ...keys].join('+')
}

/** The accelerator a chat send preference stands for. */
export function chatSendAccelerator(shortcut: ChatSendShortcut): string {
  return shortcut === 'modEnter' ? 'CommandOrControl+Enter' : 'Enter'
}

/**
 * Ids of the entries whose shortcut is also used by another active entry.
 * Inactive entries and empty shortcuts never conflict.
 */
export function findShortcutConflicts(
  entries: readonly { id: string; shortcut: string; active: boolean }[],
  platform?: string,
): Set<string> {
  const byKey = new Map<string, string[]>()
  for (const entry of entries) {
    if (!entry.active) continue
    const key = canonicalShortcut(entry.shortcut, platform)
    if (!key) continue
    byKey.set(key, [...(byKey.get(key) ?? []), entry.id])
  }
  return new Set([...byKey.values()].filter((ids) => ids.length > 1).flat())
}

const MAC_KEY_SYMBOLS: Record<string, string> = { Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↩' }

/** An accelerator as separate key-cap labels: `['⌘', 'K']` on macOS, `['Ctrl', 'K']` elsewhere. */
export function shortcutKeyCaps(shortcut: string, platform?: string): string[] {
  const label = formatShortcutLabel(shortcut, platform)
  if (!label) return []
  const isMac = isMacPlatform(platform)
  return label.split('+').map((part) => (isMac ? MAC_KEY_SYMBOLS[part] ?? part : part))
}
