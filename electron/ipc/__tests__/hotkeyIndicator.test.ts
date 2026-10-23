// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  windows: [] as Array<{
    id: number
    destroyed: boolean
    closeCalls: number
    showCalls: number
    scripts: string[]
    urls: string[]
    bounds: Array<{ x: number; y: number; width: number; height: number }>
    emitClosed: () => void
  }>,
  cursor: { x: 0, y: 0 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}))

vi.mock('electron', () => {
  class FakeBrowserWindow {
    readonly record: (typeof fake.windows)[number]
    private closedHandlers: Array<() => void> = []
    webContents = {
      isLoading: () => false,
      once: () => undefined,
      executeJavaScript: (script: string) => {
        this.record.scripts.push(script)
        return Promise.resolve()
      },
    }

    constructor() {
      this.record = {
        id: fake.windows.length + 1,
        destroyed: false,
        closeCalls: 0,
        showCalls: 0,
        scripts: [],
        urls: [],
        bounds: [],
        emitClosed: () => {
          this.record.destroyed = true
          for (const handler of this.closedHandlers) handler()
        },
      }
      fake.windows.push(this.record)
    }

    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    setBounds(bounds: { x: number; y: number; width: number; height: number }) { this.record.bounds.push(bounds) }
    loadURL(url: string) { this.record.urls.push(url) }
    on(event: string, handler: () => void) { if (event === 'closed') this.closedHandlers.push(handler) }
    isDestroyed() { return this.record.destroyed }
    // close() is asynchronous in Electron: 'closed' fires later.
    close() { this.record.closeCalls += 1 }
    showInactive() { this.record.showCalls += 1 }
  }
  return {
    BrowserWindow: FakeBrowserWindow,
    nativeTheme: { shouldUseDarkColors: false },
    screen: {
      getCursorScreenPoint: () => ({ ...fake.cursor }),
      getDisplayNearestPoint: () => ({ workArea: { ...fake.workArea } }),
    },
  }
})

type IndicatorModule = typeof import('../hotkeyIndicator')

describe('hotkey indicator', () => {
  let mod: IndicatorModule

  beforeEach(async () => {
    vi.useFakeTimers()
    fake.windows.length = 0
    fake.cursor = { x: 0, y: 0 }
    vi.resetModules()
    mod = await import('../hotkeyIndicator.js')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not replace the live translating indicator or schedule a close for a busy press', async () => {
    mod.showHotkeyIndicator('translating')
    const [win] = fake.windows
    const scriptsBefore = win.scripts.length

    mod.showHotkeyIndicator('busy', undefined, 1_200)
    await vi.advanceTimersByTimeAsync(5_000)

    expect(win.scripts).toHaveLength(scriptsBefore)
    expect(win.closeCalls).toBe(0)
    expect(fake.windows).toHaveLength(1)
  })

  it('still shows busy when nothing is in progress', async () => {
    mod.showHotkeyIndicator('busy', undefined, 1_200)
    const [win] = fake.windows
    expect(win.scripts[win.scripts.length - 1]).toContain('"busy"')

    await vi.advanceTimersByTimeAsync(1_300)
    expect(win.closeCalls).toBe(1)
  })

  it('uses a fresh window when a show races a window that is already closing', async () => {
    mod.showHotkeyIndicator('warning', undefined, 1_000)
    await vi.advanceTimersByTimeAsync(1_000)
    const [closing] = fake.windows
    expect(closing.closeCalls).toBe(1)

    // 'closed' has not fired yet — showing now must not reuse the dying window.
    mod.showHotkeyIndicator('copying')
    expect(fake.windows).toHaveLength(2)
    expect(fake.windows[1].showCalls).toBe(1)

    // The old window's late 'closed' event must not clear the new window.
    closing.emitClosed()
    mod.showHotkeyIndicator('translating')
    expect(fake.windows).toHaveLength(2)
  })

  it('never closes the same window twice', async () => {
    mod.showHotkeyIndicator('done')
    mod.hideHotkeyIndicator(500)
    await vi.advanceTimersByTimeAsync(600)
    mod.hideHotkeyIndicator(0)
    await vi.advanceTimersByTimeAsync(10)

    expect(fake.windows[0].closeCalls).toBe(1)
  })

  it('renders localized copy and keeps literal colors in the generated palette', async () => {
    mod.setHotkeyIndicatorLanguage('en')
    mod.showHotkeyIndicator('warning')
    const [win] = fake.windows

    expect(win.scripts[win.scripts.length - 1]).toContain('No text is selected.')
    const html = decodeURIComponent(win.urls[0].split(',')[1])
    expect(html).toContain('Quick translate')
    expect(html).toContain('--vzn-accent')
    expect(html).toContain('prefers-color-scheme: dark')
  })

  it('has dedicated copy for the permission and copy-failure states', async () => {
    mod.setHotkeyIndicatorLanguage('en')
    mod.showHotkeyIndicator('permission')
    const [win] = fake.windows
    expect(win.scripts[win.scripts.length - 1]).toContain('Accessibility access')

    mod.showHotkeyIndicator('copy-failed')
    expect(win.scripts[win.scripts.length - 1]).toContain('copy command')
    const html = decodeURIComponent(win.urls[0].split(',')[1])
    expect(html).toContain('data-state="permission"')
    expect(html).toContain('data-state="copy-failed"')
  })

  it('names the pair direction in the translating message', () => {
    mod.setHotkeyIndicatorLanguage('vi')
    expect(mod.translatingIntoMessage('en')).toBe('Đang dịch sang Tiếng Anh...')
    mod.setHotkeyIndicatorLanguage('en')
    expect(mod.translatingIntoMessage('vi')).toBe('Translating into Vietnamese...')
    expect(mod.translatingIntoMessage('zh-TW')).toContain('Chinese')
    mod.setHotkeyIndicatorLanguage('ja')
    expect(mod.translatingIntoMessage('en')).toBe('英語に翻訳しています...')
  })

  describe('placement', () => {
    it('sits below and to the right of the cursor', () => {
      expect(mod.computeIndicatorBounds({ x: 500, y: 400 }, { x: 0, y: 0, width: 1920, height: 1080 }))
        .toEqual({ x: 516, y: 424, width: 304, height: 60 })
    })

    it('flips above the cursor near the bottom edge and clamps to the work area', () => {
      const area = { x: 0, y: 0, width: 1920, height: 1080 }
      expect(mod.computeIndicatorBounds({ x: 500, y: 1060 }, area)).toEqual({ x: 516, y: 976, width: 304, height: 60 })
      // Right edge: never past the margin.
      expect(mod.computeIndicatorBounds({ x: 1900, y: 400 }, area).x).toBe(1920 - 304 - 12)
      // Top-left corner of a secondary display with an offset origin.
      expect(mod.computeIndicatorBounds({ x: -1920, y: -200 }, { x: -1920, y: -200, width: 1920, height: 1080 }))
        .toEqual({ x: -1904, y: -176, width: 304, height: 60 })
    })

    it('anchors once per run and re-anchors for the next run', () => {
      fake.cursor = { x: 100, y: 100 }
      mod.showHotkeyIndicator('copying')
      fake.cursor = { x: 900, y: 700 }
      mod.showHotkeyIndicator('translating')
      mod.showHotkeyIndicator('done')
      const [win] = fake.windows
      expect(win.bounds).toEqual([{ x: 116, y: 124, width: 304, height: 60 }])

      // Terminal state shown → the next press is a new run at the new cursor position.
      mod.showHotkeyIndicator('copying')
      expect(win.bounds).toHaveLength(2)
      expect(win.bounds[1]).toMatchObject({ x: 916, y: 724 })
    })
  })

  it('validates indicator languages', () => {
    expect(mod.isHotkeyIndicatorLanguage('ja')).toBe(true)
    expect(mod.isHotkeyIndicatorLanguage('fr')).toBe(false)
  })
})
