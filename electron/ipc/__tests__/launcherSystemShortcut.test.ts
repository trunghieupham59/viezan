// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const execMock = vi.hoisted(() => vi.fn())
const execFileMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({
  exec: (...args: unknown[]) => execMock(...args),
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import {
  acceleratorToMacKey,
  detectSystemShortcutConflict,
  findSystemShortcutConflict,
  setSpotlightShortcutEnabled,
  spotlightEntryPlist,
  spotlightStateFrom,
} from '../launcherSystemShortcut'

const CMD = 0x100000
const OPTION = 0x80000

/** A `com.apple.symbolichotkeys` export as `plutil -convert json` prints it. */
function hotkeys(entries: Record<string, { enabled: boolean; parameters: unknown[] }>) {
  return {
    AppleSymbolicHotKeys: Object.fromEntries(
      Object.entries(entries).map(([id, { enabled, parameters }]) => [id, { enabled, value: { parameters, type: 'standard' } }]),
    ),
  }
}

describe('acceleratorToMacKey', () => {
  it('maps modifiers and keys to macOS key codes', () => {
    expect(acceleratorToMacKey('Command+Space')).toEqual({ keyCode: 49, modifiers: CMD })
    expect(acceleratorToMacKey('Alt+Space')).toEqual({ keyCode: 49, modifiers: OPTION })
    expect(acceleratorToMacKey('CommandOrControl+Shift+T')).toEqual({ keyCode: 17, modifiers: CMD | 0x20000 })
    expect(acceleratorToMacKey('F12')).toEqual({ keyCode: 111, modifiers: 0 })
  })

  it('returns null for unknown parts', () => {
    expect(acceleratorToMacKey('Hyper+Space')).toBeNull()
    expect(acceleratorToMacKey('Command+MediaPlayPause')).toBeNull()
    expect(acceleratorToMacKey('')).toBeNull()
  })
})

describe('findSystemShortcutConflict', () => {
  const spotlightOn = hotkeys({
    '64': { enabled: true, parameters: [65535, 49, CMD] },
    '65': { enabled: true, parameters: [65535, 49, CMD | OPTION] },
  })

  it('names Spotlight when it holds Command+Space', () => {
    expect(findSystemShortcutConflict(spotlightOn, 'Command+Space')).toEqual({ owner: 'spotlight', accelerator: 'Command+Space' })
    expect(findSystemShortcutConflict(spotlightOn, 'Cmd+Space')).toMatchObject({ owner: 'spotlight' })
  })

  it('names the Finder search window for Command+Option+Space', () => {
    expect(findSystemShortcutConflict(spotlightOn, 'Command+Alt+Space')).toMatchObject({ owner: 'finder-search' })
  })

  it('ignores disabled shortcuts and other combinations', () => {
    const spotlightOff = hotkeys({ '64': { enabled: false, parameters: [65535, 49, CMD] } })
    expect(findSystemShortcutConflict(spotlightOff, 'Command+Space')).toBeNull()
    expect(findSystemShortcutConflict(spotlightOn, 'Alt+Space')).toBeNull()
    expect(findSystemShortcutConflict(spotlightOn, 'Command+Shift+Space')).toBeNull()
  })

  it('ignores extra flag bits macOS stores beside the modifier mask', () => {
    const withCaps = hotkeys({ '64': { enabled: true, parameters: [65535, 49, CMD | 0x10000] } })
    expect(findSystemShortcutConflict(withCaps, 'Command+Space')).toMatchObject({ owner: 'spotlight' })
  })

  it('reports an unknown system shortcut generically', () => {
    const other = hotkeys({ '12': { enabled: true, parameters: [65535, 49, OPTION] } })
    expect(findSystemShortcutConflict(other, 'Alt+Space')).toEqual({ owner: 'system', accelerator: 'Alt+Space' })
  })

  it('tolerates malformed data', () => {
    expect(findSystemShortcutConflict(null, 'Command+Space')).toBeNull()
    expect(findSystemShortcutConflict({ AppleSymbolicHotKeys: { '64': 'junk' } }, 'Command+Space')).toBeNull()
    expect(findSystemShortcutConflict({ AppleSymbolicHotKeys: { '64': { enabled: true, value: { parameters: ['x'] } } } }, 'Command+Space')).toBeNull()
  })
})

describe('detectSystemShortcutConflict', () => {
  beforeEach(() => {
    execMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('reads the macOS preference domain with a timeout and parses the JSON', async () => {
    execMock.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null, out: string) => void) => {
      cb(null, JSON.stringify(hotkeys({ '64': { enabled: true, parameters: [65535, 49, CMD] } })))
    })
    expect(await detectSystemShortcutConflict('Command+Space', 'darwin')).toMatchObject({ owner: 'spotlight' })
    expect(execMock.mock.calls[0][0]).toContain('com.apple.symbolichotkeys')
    expect(execMock.mock.calls[0][1]).toMatchObject({ timeout: expect.any(Number) })
  })

  it('never runs on other platforms or for an empty accelerator', async () => {
    expect(await detectSystemShortcutConflict('Command+Space', 'win32')).toBeNull()
    expect(await detectSystemShortcutConflict('', 'darwin')).toBeNull()
    expect(execMock).not.toHaveBeenCalled()
  })

  it('resolves null when the command fails or prints garbage', async () => {
    execMock.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null, out: string) => void) => {
      cb(Object.assign(new Error('timed out'), { killed: true }), '')
    })
    expect(await detectSystemShortcutConflict('Command+Space', 'darwin')).toBeNull()

    execMock.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null, out: string) => void) => cb(null, 'not json'))
    expect(await detectSystemShortcutConflict('Command+Space', 'darwin')).toBeNull()
  })
})

describe('spotlightStateFrom', () => {
  it('reads the enabled flag and the key combination', () => {
    expect(spotlightStateFrom(hotkeys({ '64': { enabled: true, parameters: [65535, 49, CMD] } }))).toEqual({ enabled: true, holdsCommandSpace: true })
    expect(spotlightStateFrom(hotkeys({ '64': { enabled: false, parameters: [65535, 49, CMD] } }))).toEqual({ enabled: false, holdsCommandSpace: true })
    expect(spotlightStateFrom(hotkeys({ '64': { enabled: true, parameters: [65535, 49, OPTION] } }))).toEqual({ enabled: true, holdsCommandSpace: false })
  })

  it('treats a missing entry as the factory default (Spotlight on Command+Space)', () => {
    expect(spotlightStateFrom(hotkeys({}))).toEqual({ enabled: true, holdsCommandSpace: true })
    expect(spotlightStateFrom(null)).toEqual({ enabled: true, holdsCommandSpace: true })
  })
})

describe('setSpotlightShortcutEnabled', () => {
  beforeEach(() => {
    execMock.mockReset()
    execFileMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    execMock.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null, out: string) => void) => {
      cb(null, JSON.stringify(hotkeys({ '64': { enabled: true, parameters: [65535, 49, CMD] } })))
    })
  })

  it('builds a plist that only flips the enabled flag', () => {
    expect(spotlightEntryPlist(false, [65535, 49, CMD])).toBe(
      '<dict><key>enabled</key><false/><key>value</key><dict><key>parameters</key><array><integer>65535</integer><integer>49</integer><integer>1048576</integer></array><key>type</key><string>standard</string></dict></dict>',
    )
    expect(spotlightEntryPlist(true, [65535, 49, CMD])).toContain('<true/>')
    // Malformed parameters fall back to the factory combination instead of being written out.
    expect(spotlightEntryPlist(true, [1.5, -1])).toContain('<integer>65535</integer><integer>49</integer><integer>1048576</integer>')
  })

  it('writes the preference without a shell and asks the system to reload shortcuts', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => cb(null))

    expect(await setSpotlightShortcutEnabled(false, 'darwin')).toEqual({ ok: true, applied: true })

    const [write, activate] = execFileMock.mock.calls
    expect(write[0]).toBe('defaults')
    expect(write[1]).toEqual(['write', 'com.apple.symbolichotkeys', 'AppleSymbolicHotKeys', '-dict-add', '64', spotlightEntryPlist(false, [65535, 49, CMD])])
    expect(write[2]).toMatchObject({ timeout: expect.any(Number) })
    expect(activate[0]).toMatch(/activateSettings$/)
    expect(activate[1]).toEqual(['-u'])
  })

  it('reports a write that landed but could not be applied live', async () => {
    execFileMock.mockImplementation((file: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => {
      cb(file === 'defaults' ? null : new Error('not found'))
    })
    expect(await setSpotlightShortcutEnabled(false, 'darwin')).toEqual({ ok: true, applied: false })
  })

  it('fails cleanly when the preference cannot be written, and never runs off macOS', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => cb(new Error('denied')))
    expect(await setSpotlightShortcutEnabled(false, 'darwin')).toEqual({ ok: false, applied: false })
    expect(execFileMock).toHaveBeenCalledTimes(1)

    execFileMock.mockClear()
    expect(await setSpotlightShortcutEnabled(false, 'win32')).toEqual({ ok: false, applied: false })
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
