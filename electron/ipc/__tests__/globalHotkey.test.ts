// @vitest-environment node
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Fakes ─────────────────────────────────────────────────────────────────────

interface FakeClipboardState {
  text: string
  html: string
  rtf: string
  image: { id: string } | null
  formats: string[]
}

const env = vi.hoisted(() => ({
  userData: '',
  clip: { text: '', html: '', rtf: '', image: null, formats: [] } as {
    text: string
    html: string
    rtf: string
    image: { id: string } | null
    formats: string[]
  },
  registered: new Map<string, () => void>(),
  registerResult: new Map<string, boolean | 'throw'>(),
  events: [] as string[],
  exec: vi.fn(),
  translate: vi.fn(),
  indicator: vi.fn(),
  hideIndicator: vi.fn(),
  indicatorLanguage: vi.fn(),
  clipboardWrites: [] as unknown[],
  send: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  exec: (...args: unknown[]) => env.exec(...args),
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => env.userData,
    once: vi.fn(),
  },
  clipboard: {
    readText: () => env.clip.text,
    readHTML: () => env.clip.html,
    readRTF: () => env.clip.rtf,
    readImage: () => ({ isEmpty: () => env.clip.image === null, ...(env.clip.image ?? {}) }),
    availableFormats: () => [...env.clip.formats],
    writeText: (text: string) => {
      env.clip = { text, html: '', rtf: '', image: null, formats: ['text/plain'] }
      env.clipboardWrites.push({ text })
    },
    write: (data: { text?: string; html?: string; rtf?: string; image?: { id: string } }) => {
      env.clip = {
        text: data.text ?? '',
        html: data.html ?? '',
        rtf: data.rtf ?? '',
        image: data.image ?? null,
        formats: Object.keys(data),
      }
      env.clipboardWrites.push(data)
    },
    clear: () => {
      env.clip = { text: '', html: '', rtf: '', image: null, formats: [] }
    },
  },
  globalShortcut: {
    register: (accelerator: string, cb: () => void) => {
      env.events.push(`register:${accelerator}`)
      const result = env.registerResult.get(accelerator)
      if (result === 'throw') throw new TypeError('bad accelerator')
      if (result === false) return false
      env.registered.set(accelerator, cb)
      return true
    },
    unregister: (accelerator: string) => {
      env.events.push(`unregister:${accelerator}`)
      env.registered.delete(accelerator)
    },
  },
}))

vi.mock('../hotkeyIndicator', () => ({
  showHotkeyIndicator: (...args: unknown[]) => env.indicator(...args),
  hideHotkeyIndicator: (...args: unknown[]) => env.hideIndicator(...args),
  setHotkeyIndicatorLanguage: (...args: unknown[]) => env.indicatorLanguage(...args),
  isHotkeyIndicatorLanguage: (value: unknown) => value === 'vi' || value === 'en' || value === 'ja',
}))

vi.mock('../lightweightTranslate', () => ({
  lightweightTranslate: (...args: unknown[]) => env.translate(...args),
}))

type GlobalHotkeyModule = typeof import('../globalHotkey')

function setClipboard(state: Partial<FakeClipboardState>) {
  env.clip = { text: '', html: '', rtf: '', image: null, formats: [], ...state }
}

describe('hotkey accelerator helpers', () => {
  let mod: GlobalHotkeyModule

  beforeEach(async () => {
    vi.resetModules()
    mod = await import('../globalHotkey')
  })

  it('accepts modifier + key accelerators and bare function keys', () => {
    for (const value of ['Alt+Shift+T', 'CommandOrControl+Shift+T', 'Ctrl+Alt+F5', 'Command+Space', 'Alt+Shift+Up', 'F9']) {
      expect(mod.isValidAccelerator(value)).toBe(true)
    }
  })

  it.each([
    'Ctrl+Shift+!',
    'Ctrl+Shift+?',
    'Alt+Shift+@',
    'Ctrl+Alt+;',
    'Ctrl+Alt+`',
    'Ctrl+Alt+Plus',
    'Ctrl+Alt+z',
    'Alt+MediaPlayPause',
    'Ctrl+MediaNextTrack',
    'Ctrl+MediaPreviousTrack',
    'Ctrl+MediaStop',
    'Ctrl+VolumeUp',
    'Ctrl+VolumeDown',
    'Ctrl+VolumeMute',
    'Ctrl+PrintScreen',
    'Alt+CapsLock',
    'Alt+NumLock',
    'Alt+ScrollLock',
    'Ctrl+Shift+num5',
  ])('accepts %s', (value) => {
    expect(mod.isValidAccelerator(value)).toBe(true)
  })

  it.each([
    'Ctrl++',
    'Ctrl+Shift',
    'Ctrl+Shift+',
    '!',
    'Ctrl+MediaFoo',
    'Ctrl+VolumeSideways',
    'Ctrl+Shift+!!',
    'Ctrl+ A',
    'Ctrl+\u00e9',
    'Ctrl+\n',
    'Hyper+A',
  ])('rejects %j', (value) => {
    expect(mod.isValidAccelerator(value)).toBe(false)
  })

  it('rejects bare printable keys, junk, non-strings and over-long values', () => {
    for (const value of ['T', 'Alt+', '', 'Alt+Shift+Hello', 'Ctrl++', 'a;rm -rf', 42, null, undefined, `Alt+${'A'.repeat(80)}`]) {
      expect(mod.isValidAccelerator(value)).toBe(false)
    }
  })

  it('normalizes equivalent spellings of the same combination', () => {
    expect(mod.normalizeAccelerator('Ctrl+Shift+T')).toBe(mod.normalizeAccelerator('Shift+Control+t'))
    expect(mod.normalizeAccelerator('Option+C')).toBe(mod.normalizeAccelerator('Alt+C'))
    expect(mod.normalizeAccelerator('Alt+C')).not.toBe(mod.normalizeAccelerator('Alt+V'))
  })
})

describe('hotkey settings IPC', () => {
  // biome-ignore lint/suspicious/noExplicitAny: IPC results are asserted structurally in tests
  let invoke: (channel: string, ...args: unknown[]) => Promise<any>
  let mod: GlobalHotkeyModule

  async function init(persisted?: { translate?: object; chat?: object }) {
    if (persisted?.translate) {
      fs.writeFileSync(path.join(env.userData, 'hotkey-settings.json'), JSON.stringify(persisted.translate))
    }
    if (persisted?.chat) {
      fs.writeFileSync(path.join(env.userData, 'ai-chat-hotkey-settings.json'), JSON.stringify(persisted.chat))
    }
    vi.resetModules()
    mod = await import('../globalHotkey')
    const handlers: Record<string, (...args: unknown[]) => unknown> = {}
    const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => { handlers[channel] = fn } }
    mod.initGlobalHotkey(ipcMain as never, () => null, vi.fn())
    invoke = async (channel, ...args) => handlers[channel]({}, ...args)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    env.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-hotkey-'))
    env.registered.clear()
    env.registerResult.clear()
    env.events.length = 0
    setClipboard({})
  })

  afterEach(() => {
    fs.rmSync(env.userData, { recursive: true, force: true })
  })

  it('rejects mistyped settings fields without touching registered shortcuts', async () => {
    await init()
    for (const payload of [
      { enabled: 'yes' },
      { hotkey: 'NotAnAccelerator' },
      { hotkey: 'T' },
      { provider: 'not-a-provider' },
      { targetLang: '../etc' },
      { targetLang: 'auto' },
      { uiLanguage: 'xx' },
      'string-payload',
      null,
    ]) {
      const result = await invoke('hotkey:update', payload)
      expect(result).toMatchObject({ success: false, errorCode: 'INVALID' })
    }
    expect(env.events).toEqual([])
  })

  it('ignores unknown fields and persists only whitelisted settings', async () => {
    await init()

    const result = await invoke('hotkey:update', {
      enabled: true,
      hotkey: 'Alt+Shift+T',
      provider: 'openai',
      model: 'gpt-x',
      targetLang: 'vi',
      uiLanguage: 'en',
      evil: '<script>',
      __proto__: { polluted: true },
    })

    expect(result.success).toBe(true)
    expect(result.settings).not.toHaveProperty('evil')
    const saved = JSON.parse(fs.readFileSync(path.join(env.userData, 'hotkey-settings.json'), 'utf-8'))
    expect(saved).toMatchObject({ enabled: true, hotkey: 'Alt+Shift+T', provider: 'openai', targetLang: 'vi' })
    expect(saved).not.toHaveProperty('evil')
    expect(env.indicatorLanguage).toHaveBeenCalledWith('en')
  })

  it('registers the new accelerator before releasing the old one', async () => {
    await init()
    await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+T' })
    env.events.length = 0

    const result = await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+Y' })

    expect(result.success).toBe(true)
    expect(env.events).toEqual(['register:Alt+Shift+Y', 'unregister:Alt+Shift+T'])
    expect([...env.registered.keys()]).toEqual(['Alt+Shift+Y'])
  })

  it('keeps the old hotkey working and unpersisted when the new one is already in use', async () => {
    await init()
    await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+T' })
    env.registerResult.set('Alt+Shift+Y', false)
    env.events.length = 0

    const result = await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+Y' })

    expect(result).toMatchObject({ success: false, errorCode: 'IN_USE' })
    expect(env.events).toEqual(['register:Alt+Shift+Y'])
    expect([...env.registered.keys()]).toEqual(['Alt+Shift+T'])
    const current = await invoke('hotkey:get')
    expect(current.settings).toMatchObject({ enabled: true, hotkey: 'Alt+Shift+T' })
    expect(JSON.parse(fs.readFileSync(path.join(env.userData, 'hotkey-settings.json'), 'utf-8')).hotkey)
      .toBe('Alt+Shift+T')
  })

  it('reports an accelerator Electron rejects as invalid, not in use', async () => {
    await init()
    await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+T' })
    env.registerResult.set('Alt+Shift+Y', 'throw')

    const result = await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+Y' })

    expect(result).toMatchObject({ success: false, errorCode: 'INVALID' })
    expect([...env.registered.keys()]).toEqual(['Alt+Shift+T'])
  })

  it('does not re-register when only non-hotkey settings change', async () => {
    await init()
    await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+T' })
    env.events.length = 0

    const result = await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+T', targetLang: 'ja' })

    expect(result.success).toBe(true)
    expect(env.events).toEqual([])
    expect(result.settings.targetLang).toBe('ja')
  })

  it('rejects colliding translate and chat hotkeys in both directions', async () => {
    await init()
    expect((await invoke('hotkey:chat:update', { enabled: true, hotkey: 'Alt+Shift+C' })).success).toBe(true)

    const translate = await invoke('hotkey:update', { enabled: true, hotkey: 'Option+Shift+C' })
    expect(translate).toMatchObject({ success: false, errorCode: 'CONFLICT' })

    expect((await invoke('hotkey:update', { enabled: true, hotkey: 'Alt+Shift+T' })).success).toBe(true)
    const chat = await invoke('hotkey:chat:update', { enabled: true, hotkey: 'Alt+Shift+T' })
    expect(chat).toMatchObject({ success: false, errorCode: 'CONFLICT' })
    expect([...env.registered.keys()].sort()).toEqual(['Alt+Shift+C', 'Alt+Shift+T'])
  })

  it('applies the same safe-swap rules to the chat hotkey', async () => {
    await init()
    await invoke('hotkey:chat:update', { enabled: true, hotkey: 'Alt+Shift+C' })
    env.registerResult.set('Alt+Shift+Z', false)

    const result = await invoke('hotkey:chat:update', { enabled: true, hotkey: 'Alt+Shift+Z' })

    expect(result).toMatchObject({ success: false, errorCode: 'IN_USE' })
    expect([...env.registered.keys()]).toEqual(['Alt+Shift+C'])
    expect((await invoke('hotkey:chat:get')).settings).toMatchObject({ enabled: true, hotkey: 'Alt+Shift+C' })
  })

  it('keeps every valid persisted field when only some fields are invalid', async () => {
    await init({
      translate: {
        enabled: true,
        hotkey: 'Alt+Shift+T',
        provider: 'not-a-provider',
        model: 'gpt-x',
        sourceLang: 'ja',
        targetLang: '../etc',
        uiLanguage: 'xx',
      },
    })

    const { settings } = await invoke('hotkey:get')
    expect(settings).toMatchObject({
      enabled: true,
      hotkey: 'Alt+Shift+T',
      provider: 'gemini', // default for the invalid field
      model: 'gpt-x',
      sourceLang: 'ja',
      targetLang: 'en', // default for the invalid field
    })
    expect(settings.uiLanguage).toBeUndefined()
    expect([...env.registered.keys()]).toEqual(['Alt+Shift+T'])
  })

  it('keeps a valid chat hotkey when its enabled flag is corrupt', async () => {
    await init({ chat: { enabled: 'yes', hotkey: 'Alt+Shift+C' } })

    expect((await invoke('hotkey:chat:get')).settings).toMatchObject({ enabled: false, hotkey: 'Alt+Shift+C' })
  })

  it('ignores invalid persisted settings instead of trusting them', async () => {
    await init({ translate: { enabled: true, hotkey: 'rm -rf /', provider: 'x' } })

    expect((await invoke('hotkey:get')).settings).toMatchObject({ enabled: false, hotkey: '' })
    expect(env.events).toEqual([])
  })
})

// ── Translate flow ────────────────────────────────────────────────────────────

describe('translate hotkey flow', () => {
  let press: () => void

  /** Make the fake OS keystroke helpers behave: copy puts `selection` on the clipboard. */
  function installExec(opts: { selection?: string; failCopy?: boolean; hangPaste?: boolean; copyDelayMs?: number } = {}) {
    env.exec.mockImplementation((command: string, _options: unknown, cb: (error: Error | null) => void) => {
      const isCopy = /\^c|ctrl\+c|keystroke "c"/.test(command)
      if (isCopy) {
        if (opts.failCopy) {
          cb(Object.assign(new Error('Command failed'), { killed: true }))
          return
        }
        const selection = opts.selection
        if (selection !== undefined) {
          const publish = () => {
            env.clip = { text: selection, html: '', rtf: '', image: null, formats: ['text/plain'] }
          }
          if (opts.copyDelayMs) setTimeout(publish, opts.copyDelayMs)
          else publish()
        }
        cb(null)
        return
      }
      if (opts.hangPaste) {
        cb(Object.assign(new Error('timed out'), { killed: true }))
        return
      }
      cb(null)
    })
  }

  async function initAndGetPress() {
    vi.resetModules()
    const mod = await import('../globalHotkey')
    const handlers: Record<string, (...args: unknown[]) => unknown> = {}
    const ipcMain = { handle: (channel: string, fn: (...args: unknown[]) => unknown) => { handlers[channel] = fn } }
    const window = { webContents: { send: env.send } }
    mod.initGlobalHotkey(ipcMain as never, () => window as never, vi.fn())
    await handlers['hotkey:update']({}, { enabled: true, hotkey: 'Alt+Shift+T', provider: 'gemini', targetLang: 'vi' })
    const callback = env.registered.get('Alt+Shift+T')
    if (!callback) throw new Error('translate hotkey was not registered')
    press = callback
  }

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    env.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-hotkey-'))
    env.registered.clear()
    env.registerResult.clear()
    env.events.length = 0
    env.clipboardWrites.length = 0
    setClipboard({})
    env.translate.mockResolvedValue({ success: true, translatedText: 'xin chao' })
    installExec({ selection: 'hello' })
    await initAndGetPress()
  })

  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(env.userData, { recursive: true, force: true })
  })

  it('runs keystroke helpers with a hard timeout', async () => {
    setClipboard({ text: 'original', formats: ['text/plain'] })
    press()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(env.exec).toHaveBeenCalled()
    for (const call of env.exec.mock.calls) {
      expect(call[1]).toMatchObject({ timeout: 5_000, windowsHide: true })
      if (process.platform === 'win32') {
        expect(call[0]).toContain('-NonInteractive -WindowStyle Hidden')
      }
    }
  })

  it('restores text, html, rtf and image after the paste', async () => {
    const image = { id: 'img-1' }
    setClipboard({ text: 'orig', html: '<b>orig</b>', rtf: '{\\rtf1 orig}', image, formats: ['text/plain', 'text/html', 'text/rtf', 'image/png'] })

    press()
    await vi.advanceTimersByTimeAsync(400)
    // Mid-run: the clipboard holds the translation, not the original.
    expect(env.clip.text).toBe('xin chao')

    await vi.advanceTimersByTimeAsync(1_600)

    expect(env.clip).toMatchObject({ text: 'orig', html: '<b>orig</b>', rtf: '{\\rtf1 orig}', image })
  })

  it('does not write an empty string over a clipboard without text', async () => {
    const image = { id: 'img-2' }
    setClipboard({ image, formats: ['image/png'] })

    press()
    await vi.advanceTimersByTimeAsync(2_500)

    expect(env.clip.image).toMatchObject(image)
    expect(env.clipboardWrites).not.toContainEqual({ text: '' })
  })

  it('releases the busy flag right after the paste and snapshots the ORIGINAL clipboard on a quick second press', async () => {
    setClipboard({ text: 'orig', formats: ['text/plain'] })

    press()
    await vi.advanceTimersByTimeAsync(600)
    // Pasted and done; the clipboard still holds the translation until the restore timer fires.
    expect(env.clip.text).toBe('xin chao')
    expect(env.send).toHaveBeenCalledWith('hotkey:translated', expect.anything())
    env.indicator.mockClear()
    env.exec.mockClear()

    installExec({ selection: 'again' })
    env.translate.mockResolvedValue({ success: true, translatedText: 'lai nua' })
    press() // restore window: must NOT be reported busy
    await vi.advanceTimersByTimeAsync(600)
    expect(env.indicator).not.toHaveBeenCalledWith('busy', expect.anything(), expect.anything())
    expect(env.exec).toHaveBeenCalled()
    expect(env.translate).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'again' }))

    // The second run snapshotted 'orig' (not 'xin chao') and restores it.
    await vi.advanceTimersByTimeAsync(3_000)
    expect(env.clip.text).toBe('orig')
  })

  it('still reports busy while a translation is in flight', async () => {
    let finish: (value: unknown) => void = () => {}
    env.translate.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    setClipboard({ text: 'orig', formats: ['text/plain'] })

    press()
    await vi.advanceTimersByTimeAsync(400)
    press()
    await vi.advanceTimersByTimeAsync(0)
    expect(env.indicator).toHaveBeenCalledWith('busy', undefined, 1_200)

    finish({ success: true, translatedText: 'xin chao' })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(env.clip.text).toBe('orig')
  })

  it('waits for a slow copy instead of reporting no selection after a fixed delay', async () => {
    installExec({ selection: 'hello', copyDelayMs: 800 })
    setClipboard({ text: 'orig', formats: ['text/plain'] })

    press()
    await vi.advanceTimersByTimeAsync(700)
    expect(env.indicator).not.toHaveBeenCalledWith('warning', undefined, 1_500)
    await vi.advanceTimersByTimeAsync(400)

    expect(env.translate).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }))
    expect(env.indicator).not.toHaveBeenCalledWith('warning', undefined, 1_500)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(env.clip.text).toBe('orig')
  })

  it('gives up after about one second and restores the original clipboard', async () => {
    installExec({ selection: 'too late', copyDelayMs: 3_000 })
    setClipboard({ text: 'orig', html: '<b>orig</b>', formats: ['text/plain', 'text/html'] })

    press()
    await vi.advanceTimersByTimeAsync(1_500)

    expect(env.indicator).toHaveBeenCalledWith('warning', undefined, 1_500)
    expect(env.translate).not.toHaveBeenCalled()
    expect(env.clip).toMatchObject({ text: 'orig', html: '<b>orig</b>' })
  })

  it('restores the original clipboard when nothing is selected', async () => {
    installExec({}) // copy succeeds but publishes nothing
    setClipboard({ text: 'orig', html: '<b>orig</b>', formats: ['text/plain', 'text/html'] })

    press()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(env.indicator).toHaveBeenCalledWith('warning', undefined, 1_500)
    expect(env.clip).toMatchObject({ text: 'orig', html: '<b>orig</b>' })
  })

  it('leaves a clipboard with non-restorable formats untouched when nothing is selected', async () => {
    installExec({})
    setClipboard({ text: 'C:\\a.txt', formats: ['text/uri-list', 'text/plain', 'application/x-app-private'] })
    const before = { ...env.clip, formats: [...env.clip.formats] }
    env.clipboardWrites.length = 0

    press()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(env.indicator).toHaveBeenCalledWith('warning', undefined, 1_500)
    expect(env.clip).toEqual(before) // never cleared, never rewritten
    expect(env.clipboardWrites).toEqual([])
  })

  it('leaves a non-restorable clipboard untouched when the copy helper fails', async () => {
    installExec({ failCopy: true })
    setClipboard({ formats: ['text/uri-list'] })

    press()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(env.clip.formats).toEqual(['text/uri-list'])
    expect(env.clipboardWrites).toEqual([])
  })

  it('detects a copy by content change when the clipboard cannot be cleared', async () => {
    installExec({ selection: 'hello', copyDelayMs: 300 })
    setClipboard({ text: 'cells', formats: ['text/plain', 'application/x-excel'] })

    press()
    await vi.advanceTimersByTimeAsync(200)
    // Not cleared up front: the original is still there until the copy lands.
    expect(env.clip.text).toBe('cells')
    expect(env.translate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)

    expect(env.translate).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }))
    expect(env.send).toHaveBeenCalledWith('hotkey:translated', expect.anything())
  })

  it('does not overwrite something the user copied during the restore window', async () => {
    setClipboard({ text: 'orig', formats: ['text/plain'] })

    press()
    await vi.advanceTimersByTimeAsync(600)
    env.clip = { text: 'user copied this', html: '', rtf: '', image: null, formats: ['text/plain'] }
    await vi.advanceTimersByTimeAsync(2_000)

    expect(env.clip.text).toBe('user copied this')
  })

  it('resets the busy flag when the copy helper hangs or fails', async () => {
    installExec({ failCopy: true })
    setClipboard({ text: 'orig', formats: ['text/plain'] })

    press()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(env.indicator).toHaveBeenCalledWith('warning', undefined, 1_500)
    expect(env.clip.text).toBe('orig')

    installExec({ selection: 'hello' })
    env.indicator.mockClear()
    press()
    await vi.advanceTimersByTimeAsync(600)
    expect(env.indicator).not.toHaveBeenCalledWith('busy', expect.anything(), expect.anything())
    expect(env.translate).toHaveBeenCalled()
  })

  it('restores the clipboard and reports an error when the paste helper fails', async () => {
    installExec({ selection: 'hello', hangPaste: true })
    setClipboard({ text: 'orig', formats: ['text/plain'] })

    press()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(env.clip.text).toBe('orig')
    expect(env.send).toHaveBeenCalledWith('hotkey:error', expect.objectContaining({ error: expect.any(String) }))
    expect(env.send).not.toHaveBeenCalledWith('hotkey:translated', expect.anything())
  })

  it('restores the clipboard when the translation fails', async () => {
    env.translate.mockResolvedValue({ success: false, error: 'boom' })
    setClipboard({ text: 'orig', html: '<i>orig</i>', formats: ['text/plain', 'text/html'] })

    press()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(env.clip).toMatchObject({ text: 'orig', html: '<i>orig</i>' })
    expect(env.indicator).toHaveBeenCalledWith('error', 'boom', 2_200)
  })
})
