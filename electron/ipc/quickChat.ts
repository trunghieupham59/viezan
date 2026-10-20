import type { BrowserWindow, IpcMain, Rectangle } from 'electron'
import { MAX_CHAT_REQUEST_CHARS } from './ipcConstants'
import { registerLauncherHandlers } from './launcher'

export const QUICK_CHAT_COMPACT_HEIGHT = 62
export const QUICK_CHAT_EXPANDED_HEIGHT = 540

// Windows fixes min/max bounds for non-resizable windows. Clear the size
// constraints without toggling the native frame style, which causes a flash.
export function setQuickChatWindowBounds(win: BrowserWindow, bounds: Rectangle): void {
  const current = win.getBounds()
  if (current.x === bounds.x && current.y === bounds.y
    && current.width === bounds.width && current.height === bounds.height) return
  win.setMinimumSize(0, 0)
  win.setMaximumSize(0, 0)
  win.setBounds(bounds)
}

export interface QuickChatSeedPayload {
  question: string
  response?: string
  provider: string
  model: string
}

const MAX_QUICK_CHAT_RESPONSE_CHARS = 80_000
const QUICK_CHAT_PROVIDERS = new Set(['local', 'gemini', 'claude', 'openai'])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > maxLength) return null
  return text
}

export function parseQuickChatSeedPayload(rawPayload: unknown): QuickChatSeedPayload | null {
  if (!isPlainRecord(rawPayload)) return null

  const question = cleanText(rawPayload.question, MAX_CHAT_REQUEST_CHARS)
  const provider = cleanText(rawPayload.provider, 32)
  const model = cleanText(rawPayload.model, 160)
  if (!question || !provider || !model || !QUICK_CHAT_PROVIDERS.has(provider)) return null

  let response: string | undefined
  if (rawPayload.response !== undefined) {
    const cleanedResponse = cleanText(rawPayload.response, MAX_QUICK_CHAT_RESPONSE_CHARS)
    if (cleanedResponse === null) return null
    response = cleanedResponse
  }

  return { question, response, provider, model }
}

export function registerQuickChatHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  getQuickChatWindow: () => BrowserWindow | null,
): void {
  const warmLauncher = registerLauncherHandlers(ipcMain, getQuickChatWindow)
  void warmLauncher()

  // Only the popup main frame may request a content height; width and position remain native-owned.
  ipcMain.handle('quick-chat:set-layout', (event, layout: unknown, contentHeight: unknown) => {
    const win = getQuickChatWindow()
    if (!win || win.isDestroyed() || event.sender !== win.webContents
      || event.senderFrame !== win.webContents.mainFrame
      || (layout !== 'compact' && layout !== 'expanded')
      || (contentHeight !== undefined && (layout !== 'expanded' || typeof contentHeight !== 'number'
        || !Number.isSafeInteger(contentHeight) || contentHeight < 0))) return { success: false }
    setQuickChatWindowBounds(win, {
      ...win.getBounds(),
      height: layout === 'compact' ? QUICK_CHAT_COMPACT_HEIGHT
        : Math.max(QUICK_CHAT_COMPACT_HEIGHT, Math.min(QUICK_CHAT_EXPANDED_HEIGHT,
          typeof contentHeight === 'number' ? contentHeight : QUICK_CHAT_EXPANDED_HEIGHT)),
    })
    return { success: true }
  })

  ipcMain.handle('quick-chat:hide', () => {
    getQuickChatWindow()?.hide()
    return { success: true }
  })

  ipcMain.handle('quick-chat:open-settings', () => {
    getQuickChatWindow()?.hide()
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'Main window is not available.' }

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('quick-chat:open-settings')
    return { success: true }
  })

  ipcMain.handle('quick-chat:open-in-chat', (_event, rawPayload: unknown) => {
    const payload = rawPayload === undefined ? null : parseQuickChatSeedPayload(rawPayload)
    if (rawPayload !== undefined && !payload) {
      return { success: false, error: 'Invalid quick chat payload.' }
    }

    getQuickChatWindow()?.hide()
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'Main window is not available.' }

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('quick-chat:open-in-main-chat', payload)
    return { success: true }
  })
}
