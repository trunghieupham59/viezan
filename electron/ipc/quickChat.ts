import type { BrowserWindow, IpcMain } from 'electron'
import { MAX_CHAT_REQUEST_CHARS } from './ipcConstants'
import { registerLauncherHandlers } from './launcher'

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
