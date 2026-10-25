import { describe, expect, it } from 'vitest'
import { recordHotkey } from '../hotkeyRecording'

const press = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  recordHotkey({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('recordHotkey', () => {
  it('rejects a plain letter, or Shift plus a letter, as needing a modifier', () => {
    expect(press('t')).toEqual({ kind: 'needs-modifier' })
    expect(press('T', { shiftKey: true })).toEqual({ kind: 'needs-modifier' })
  })

  it('builds an accelerator when Command, Control or Option is held', () => {
    expect(press('t', { altKey: true })).toEqual({ kind: 'accelerator', accelerator: 'Alt+T' })
    expect(press(' ', { metaKey: true, shiftKey: true })).toEqual({ kind: 'accelerator', accelerator: 'Command+Shift+Space' })
  })

  it('lets plain Tab through instead of capturing it', () => {
    expect(press('Tab')).toEqual({ kind: 'ignore' })
    expect(press('Tab', { shiftKey: true })).toEqual({ kind: 'ignore' })
  })

  it('cancels on Escape and waits on a lone modifier', () => {
    expect(press('Escape')).toEqual({ kind: 'cancel' })
    expect(press('Alt', { altKey: true })).toEqual({ kind: 'ignore' })
  })

  it('accepts a function key on its own', () => {
    expect(press('F5')).toEqual({ kind: 'accelerator', accelerator: 'F5' })
  })
})
