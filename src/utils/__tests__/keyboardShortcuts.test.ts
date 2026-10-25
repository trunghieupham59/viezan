import { describe, expect, it } from 'vitest'
import { canonicalShortcut, chatSendAccelerator, eventMatchesShortcut, findShortcutConflicts, formatShortcutLabel, keyEventToAccelerator, shortcutKeyCaps, shouldSendChatMessage } from '../keyboardShortcuts'

const event = (overrides: Partial<KeyboardEvent>): KeyboardEvent => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
}) as KeyboardEvent

describe('keyboardShortcuts', () => {
  it('formats CommandOrControl per platform', () => {
    expect(formatShortcutLabel('CommandOrControl+N', 'darwin')).toBe('Cmd+N')
    expect(formatShortcutLabel('CommandOrControl+N', 'win32')).toBe('Ctrl+N')
  })

  it('converts key events to accelerator strings', () => {
    expect(keyEventToAccelerator(event({ key: 'k', altKey: true }))).toBe('Alt+K')
    expect(keyEventToAccelerator(event({ key: 'Enter', metaKey: true }))).toBe('Command+Enter')
    expect(keyEventToAccelerator(event({ key: 'Meta', metaKey: true }))).toBe('')
  })

  it('matches platform-aware shortcuts exactly', () => {
    expect(eventMatchesShortcut(event({ key: 'n', metaKey: true }), 'CommandOrControl+N', 'darwin')).toBe(true)
    expect(eventMatchesShortcut(event({ key: 'n', ctrlKey: true }), 'CommandOrControl+N', 'win32')).toBe(true)
    expect(eventMatchesShortcut(event({ key: 'n', ctrlKey: true }), 'CommandOrControl+N', 'darwin')).toBe(false)
    expect(eventMatchesShortcut(event({ key: 'n', metaKey: true, shiftKey: true }), 'CommandOrControl+N', 'darwin')).toBe(false)
  })

  it('honors chat send shortcut modes', () => {
    expect(shouldSendChatMessage(event({ key: 'Enter' }), 'enter', 'darwin')).toBe(true)
    expect(shouldSendChatMessage(event({ key: 'Enter', shiftKey: true }), 'enter', 'darwin')).toBe(false)
    expect(shouldSendChatMessage(event({ key: 'Enter' }), 'modEnter', 'darwin')).toBe(false)
    expect(shouldSendChatMessage(event({ key: 'Enter', metaKey: true }), 'modEnter', 'darwin')).toBe(true)
  })

  it('leaves Enter to the input method while a Vietnamese or Japanese word is being composed', () => {
    expect(shouldSendChatMessage(event({ key: 'Enter', isComposing: true }), 'enter', 'darwin')).toBe(false)
    expect(shouldSendChatMessage(event({ key: 'Enter', keyCode: 229 }), 'enter', 'win32')).toBe(false)
    expect(shouldSendChatMessage(event({ key: 'Enter', metaKey: true, isComposing: true }), 'modEnter', 'darwin')).toBe(false)
  })
})

describe('shortcut conflicts', () => {
  it('resolves CommandOrControl per platform before comparing', () => {
    expect(canonicalShortcut('CommandOrControl+Shift+K', 'darwin')).toBe('Command+Shift+K')
    expect(canonicalShortcut('Shift+CmdOrCtrl+k', 'win32')).toBe('Ctrl+Shift+K')
    expect(canonicalShortcut('', 'darwin')).toBe('')
  })

  it('flags every active entry that shares keys, and ignores inactive or empty ones', () => {
    const conflicts = findShortcutConflicts([
      { id: 'a', shortcut: 'Command+K', active: true },
      { id: 'b', shortcut: 'CommandOrControl+K', active: true },
      { id: 'c', shortcut: 'Command+K', active: false },
      { id: 'd', shortcut: '', active: true },
      { id: 'e', shortcut: 'Alt+T', active: true },
    ], 'darwin')
    expect([...conflicts].sort()).toEqual(['a', 'b'])
    // The same pair is distinct on Windows, where CommandOrControl means Ctrl.
    expect(findShortcutConflicts([
      { id: 'a', shortcut: 'Command+K', active: true },
      { id: 'b', shortcut: 'CommandOrControl+K', active: true },
    ], 'win32').size).toBe(0)
  })

  it('splits a shortcut into key caps with macOS symbols', () => {
    expect(shortcutKeyCaps('Alt+Shift+T', 'darwin')).toEqual(['⌥', '⇧', 'T'])
    expect(shortcutKeyCaps('CommandOrControl+Enter', 'win32')).toEqual(['Ctrl', 'Enter'])
    expect(shortcutKeyCaps('', 'darwin')).toEqual([])
    expect(chatSendAccelerator('modEnter')).toBe('CommandOrControl+Enter')
    expect(chatSendAccelerator('enter')).toBe('Enter')
  })
})
