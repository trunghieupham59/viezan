import path from 'node:path'
import { app, type BrowserWindow, type IpcMain, type IpcMainInvokeEvent, type Rectangle } from 'electron'
import type { LauncherFeatureRequest } from '../../shared/launcher'
import type { QuickAiSession, QuickAiTurn } from '../../shared/quickAi'
import type { QuickChatSeedPayload } from '../../shared/quickChatApi'
import { parseQuickAiSession, parseQuickAiTurns, QuickAiSessionStore } from '../services/quickAiSession'
import { QUICK_CHAT_CHANNELS } from './channels'
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
  // A transparent macOS window keeps its old shadow outline after a resize.
  if (process.platform === 'darwin' && typeof win.invalidateShadow === 'function') win.invalidateShadow()
}

export type { QuickChatSeedPayload }

const MAX_QUICK_CHAT_RESPONSE_CHARS = 80_000
const QUICK_CHAT_PROVIDERS = new Set(['local', 'gemini', 'claude', 'openai'])
const USAGE_FEATURES = new Set(['chat', 'translate', 'live', 'dictionary'])

/** Mirrors the renderer's UsageCost: aggregate numbers only, never key material. */
export interface QuickChatUsagePayload {
  id: string
  feature: string
  provider: string
  model: string
  amountUsd: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimated: boolean
  createdAt: number
}

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export function parseQuickChatUsagePayload(rawPayload: unknown): QuickChatUsagePayload | null {
  if (!isPlainRecord(rawPayload)) return null
  const id = cleanText(rawPayload.id, 80)
  const feature = cleanText(rawPayload.feature, 32)
  const provider = cleanText(rawPayload.provider, 32)
  const model = cleanText(rawPayload.model, 160)
  if (!id || !feature || !provider || !model || !USAGE_FEATURES.has(feature) || !QUICK_CHAT_PROVIDERS.has(provider)) return null
  const { amountUsd, inputTokens, outputTokens, totalTokens, estimated, createdAt } = rawPayload
  if (![amountUsd, inputTokens, outputTokens, totalTokens].every(isNonNegativeNumber)) return null
  if (typeof estimated !== 'boolean' || !isNonNegativeNumber(createdAt) || createdAt === 0) return null
  return {
    id, feature, provider, model,
    amountUsd: amountUsd as number, inputTokens: inputTokens as number,
    outputTokens: outputTokens as number, totalTokens: totalTokens as number,
    estimated, createdAt: createdAt as number,
  }
}

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

  let history: QuickAiTurn[] | undefined
  if (rawPayload.history !== undefined) {
    const parsed = parseQuickAiTurns(rawPayload.history)
    if (!parsed) return null
    if (parsed.length) history = parsed
  }

  return { question, response, history, provider, model }
}

const LAUNCHER_FEATURES = new Set<LauncherFeatureRequest['feature']>(['translate', 'dictionary', 'live'])
const MAX_LAUNCHER_SEED_CHARS = 500

export function parseLauncherFeatureRequest(rawPayload: unknown): LauncherFeatureRequest | null {
  if (!isPlainRecord(rawPayload)) return null
  const feature = rawPayload.feature
  if (typeof feature !== 'string' || !LAUNCHER_FEATURES.has(feature as LauncherFeatureRequest['feature'])) return null
  if (rawPayload.text === undefined) return { feature: feature as LauncherFeatureRequest['feature'] }
  const text = cleanText(rawPayload.text, MAX_LAUNCHER_SEED_CHARS)
  if (text === null) return null
  return { feature: feature as LauncherFeatureRequest['feature'], text }
}

export function registerQuickChatHandlers(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  getQuickChatWindow: () => BrowserWindow | null,
): void {
  const warmLauncher = registerLauncherHandlers(ipcMain, getQuickChatWindow)
  void warmLauncher()

  // Only the popup main frame may read or replace the persisted Quick AI session.
  const isPopupSender = (event: IpcMainInvokeEvent) => {
    const win = getQuickChatWindow()
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents
      && event.senderFrame === win.webContents.mainFrame)
  }
  let sessionStore: QuickAiSessionStore | undefined
  const sessions = () => {
    sessionStore ??= new QuickAiSessionStore(path.join(app.getPath('userData'), 'quick-ai-session-v1.json'))
    return sessionStore
  }

  // Quick AI answers are billed in the main window, which owns the usage store.
  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.recordUsage, (event, rawPayload: unknown) => {
    if (!isPopupSender(event)) return { success: false, error: 'Unauthorized sender.' }
    const payload = parseQuickChatUsagePayload(rawPayload)
    if (!payload) return { success: false, error: 'Invalid usage payload.' }
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false, error: 'Main window is not available.' }
    mainWindow.webContents.send(QUICK_CHAT_CHANNELS.event.usage, payload)
    return { success: true }
  })

  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.sessionGet, async (event): Promise<{ success: boolean; session: QuickAiSession | null }> => {
    if (!isPopupSender(event)) return { success: false, session: null }
    return { success: true, session: await sessions().get() }
  })

  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.sessionSave, async (event, rawSession: unknown) => {
    if (!isPopupSender(event)) return { success: false, error: 'Unauthorized sender.' }
    const session = parseQuickAiSession(rawSession)
    if (!session) return { success: false, error: 'Invalid Quick AI session.' }
    try {
      await sessions().save(session)
      return { success: true }
    } catch {
      return { success: false, error: 'Could not save the Quick AI session.' }
    }
  })

  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.sessionClear, async (event) => {
    if (!isPopupSender(event)) return { success: false, error: 'Unauthorized sender.' }
    try {
      await sessions().clear()
      return { success: true }
    } catch {
      return { success: false, error: 'Could not clear the Quick AI session.' }
    }
  })

  // Only the popup main frame may request a content height; width and position remain native-owned.
  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.setLayout, (event, layout: unknown, contentHeight: unknown) => {
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

  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.hide, () => {
    getQuickChatWindow()?.hide()
    return { success: true }
  })

  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.openSettings, () => {
    getQuickChatWindow()?.hide()
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'Main window is not available.' }

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send(QUICK_CHAT_CHANNELS.event.openSettings)
    return { success: true }
  })

  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.openInChat, (_event, rawPayload: unknown) => {
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
    mainWindow.webContents.send(QUICK_CHAT_CHANNELS.event.openInMainChat, payload)
    return { success: true }
  })

  // Only the launcher window may deep-link a main-window feature with a short seed text.
  ipcMain.handle(QUICK_CHAT_CHANNELS.invoke.openFeature, (event, rawPayload: unknown) => {
    const win = getQuickChatWindow()
    if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      return { success: false, error: 'Unauthorized sender.' }
    }
    const payload = parseLauncherFeatureRequest(rawPayload)
    if (!payload) return { success: false, error: 'Invalid launcher feature payload.' }

    win.hide()
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false, error: 'Main window is not available.' }

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send(QUICK_CHAT_CHANNELS.event.openFeature, payload)
    return { success: true }
  })
}
