import type { BrowserWindow, IpcMain } from 'electron'
import type { LiveAssemblyRequest, LiveTranslationRequest } from '../../shared/liveInterpretation'
import { LiveInterpretationService } from '../services/LiveInterpretationService'
import { isRecord } from './ipcValidation'
import { LIVE_CONTEXT_CHARS, LIVE_SOURCE_CHARS } from './liveTranslationPolicy'
import { isLocalProvider, LOCAL_AI_PLACEHOLDER_KEY } from './localAi'
import { isSenderWindow } from './senderGuard'
import { getStoredApiKey } from './storage'
import { TRANSLATE_PROVIDERS } from './translateProviders'
import { parseTranslateParams } from './translateValidation'

const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,100}$/.test(id)

export function registerLiveInterpretationHandlers(ipc: IpcMain, getMainWindow: () => BrowserWindow | null, getSubtitleWindow: () => BrowserWindow | null) {
  const observedSenders = new WeakSet<object>()
  const service = new LiveInterpretationService(async (request, options) => {
    const key = isLocalProvider(request.provider) ? LOCAL_AI_PLACEHOLDER_KEY : getStoredApiKey(request.provider)
    if (!key) throw Object.assign(new Error('No provider credential'), { errorCode: 'NO_API_KEY' })
    return TRANSLATE_PROVIDERS[request.provider](key, request.model, request.sourceText, request.sourceLang, request.targetLang, false, 'general', false, 'off', 'low', options)
  })
  ipc.handle('live:begin', (event, sessionId: unknown) => {
    if (!isSenderWindow(event, getMainWindow) || !validId(sessionId)) return
    service.begin(sessionId)
    // Listener is idempotent per WebContents, and releases queued requests on a crash/close.
    if (!observedSenders.has(event.sender)) {
      observedSenders.add(event.sender)
      event.sender.once('destroyed', () => service.cancel())
    }
  })
  ipc.handle('live:cancel', (event, sessionId: unknown) => {
    if (isSenderWindow(event, getMainWindow) && validId(sessionId)) service.cancel(sessionId)
  })
  ipc.handle('live:assemble', (event, raw: unknown) => {
    if (!isSenderWindow(event, getMainWindow)) return { success: false, errorCode: 'PERMISSION_DENIED' }
    if (!isRecord(raw) || !validId(raw.sessionId)
      || !['append', 'silence', 'stop'].includes(String(raw.action))
      || typeof raw.sourceText !== 'string' || raw.sourceText.length > LIVE_SOURCE_CHARS
      || (raw.action === 'append' && !raw.sourceText.trim())
      || (raw.action !== 'append' && raw.sourceText !== '')
      || typeof raw.sourceLang !== 'string' || !/^(?:auto|[a-z]{2,3}(?:-[A-Za-z]{2,4})?)$/.test(raw.sourceLang)
      || typeof raw.targetLang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(raw.targetLang)
      || typeof raw.speaker !== 'string' || raw.speaker.length > 80
      || typeof raw.pause !== 'boolean'
      || !Number.isSafeInteger(raw.sequence) || (raw.sequence as number) < 0
      || typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs) || raw.durationMs < 0 || raw.durationMs > 60_000
      || typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp) || raw.timestamp < 0) {
      return { success: false, errorCode: 'INVALID_INPUT' }
    }
    return service.assemble(raw as unknown as LiveAssemblyRequest)
  })
  ipc.handle('live:translate', async (event, raw: unknown) => {
    if (!isSenderWindow(event, getMainWindow)) return { success: false, errorCode: 'PERMISSION_DENIED' }
    if (!isRecord(raw) || !validId(raw.sessionId) || !validId(raw.segmentId)
      || typeof raw.context !== 'string' || raw.context.length > LIVE_CONTEXT_CHARS
      || typeof raw.sourceText !== 'string' || !raw.sourceText.trim() || raw.sourceText.length > LIVE_SOURCE_CHARS
      || (raw.revision !== undefined && (!Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1))
      || typeof raw.subtitles !== 'boolean' || !parseTranslateParams(raw).ok) {
      return { success: false, errorCode: 'INVALID_INPUT' }
    }
    const request = raw as unknown as LiveTranslationRequest
    const revision = service.getRevision()
    const result = await service.translate(request)
    // Only validated complete translations are published. Raw provider tokens can contain reasoning.
    const subtitle = getSubtitleWindow()
    // Provisional translations stay in the main UI, where they have an explicit
    // label. The overlay only receives the settled revision.
    if (result.success && request.revision === undefined && service.isActive(request.sessionId, revision) && request.subtitles && subtitle && !subtitle.isDestroyed()) {
      subtitle.webContents.send('subtitle:stream:start', { segId: request.segmentId })
      subtitle.webContents.send('subtitle:stream:token', { segId: request.segmentId, token: result.translatedText })
      subtitle.webContents.send('subtitle:stream:end', { segId: request.segmentId })
    }
    return result
  })
}
