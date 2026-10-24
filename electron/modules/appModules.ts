/**
 * The main-process modules Viezan ships, in start order (chat, translate, live,
 * dictionary, thermal, launcher, browser-bridge). Handlers are registered for
 * every module; start/stop runs only for enabled ones (see host.ts).
 *
 * Core services (keychain, models, local AI, system, updater, capabilities, the hotkey
 * settings store) are not modules: they stay registered directly in main.ts.
 */
import type { BrowserWindow, IpcMain } from 'electron'
import { registerChatHandlers } from '../ipc/chat'
import { setHotkeyModuleActive } from '../ipc/globalHotkey'
import { registerImageTranslateHandlers } from '../ipc/imageTranslate'
import { initLegacyAssistant, setLocalServerAccessors } from '../ipc/legacyAssistant'
import { registerLiveInterpretationHandlers } from '../ipc/liveInterpretation'
import { getServerToken, LOCAL_SERVER_PORT, registerLocalServerHandlers, startLocalServer, stopLocalServer } from '../ipc/localServer'
import { registerQuickChatHandlers } from '../ipc/quickChat'
import { registerSubtitleHandlers } from '../ipc/subtitle'
import { registerTranscribeHandlers } from '../ipc/transcribe'
import { registerTranslateHandlers } from '../ipc/translate'
import { registerTtsHandlers } from '../ipc/tts'
import { registerWebSearchHandlers } from '../ipc/webSearch'
import type { ThermalRuntime } from '../thermal'
import { registerThermalHandlers } from '../thermal/ipc'
import type { MainModule } from './host'

export interface AppModuleDeps {
  ipcMain: IpcMain
  getMainWindow: () => BrowserWindow | null
  getSubtitleWindow: () => BrowserWindow | null
  createSubtitleWindow: () => void
  closeSubtitleWindow: () => void
  getQuickChatWindow: () => BrowserWindow | null
  hideQuickChatWindow: () => void
  thermal: ThermalRuntime
}

export function createAppModules(deps: AppModuleDeps): MainModule[] {
  const { ipcMain } = deps
  return [
    {
      id: 'chat',
      registerHandlers: () => {
        registerChatHandlers(ipcMain)
        registerWebSearchHandlers(ipcMain)
      },
    },
    {
      id: 'translate',
      registerHandlers: () => {
        registerTranslateHandlers(ipcMain)
        registerImageTranslateHandlers(ipcMain)
      },
      // Quick Translate's global shortcut belongs to this module; its settings stay editable while off.
      start: () => setHotkeyModuleActive('translate', true),
      stop: () => setHotkeyModuleActive('translate', false),
    },
    {
      id: 'live',
      registerHandlers: () => {
        registerTranscribeHandlers(ipcMain)
        registerLiveInterpretationHandlers(ipcMain, deps.getMainWindow, deps.getSubtitleWindow)
        registerTtsHandlers(ipcMain)
        registerSubtitleHandlers(ipcMain, deps.getSubtitleWindow, deps.getMainWindow, deps.createSubtitleWindow)
      },
      stop: () => deps.closeSubtitleWindow(),
    },
    {
      // Dictionary reuses the chat and translate IPC; it has no main-process surface of its own.
      id: 'dictionary',
    },
    {
      // Sensors and fans. Off by default where nothing can be read (Windows, missing reader).
      // `start` restores the menu bar / tray reading; `stop` hides it and releases the reader.
      id: 'thermal',
      registerHandlers: () => registerThermalHandlers(ipcMain, deps.thermal),
      start: () => deps.thermal.start(),
      stop: () => deps.thermal.stop(),
      defaultEnabled: deps.thermal.getSupport().supported,
    },
    {
      id: 'launcher',
      registerHandlers: () => registerQuickChatHandlers(ipcMain, deps.getMainWindow, deps.getQuickChatWindow),
      start: () => setHotkeyModuleActive('chat', true),
      stop: () => {
        setHotkeyModuleActive('chat', false)
        deps.hideQuickChatWindow()
      },
    },
    {
      id: 'browser-bridge',
      registerHandlers: () => {
        registerLocalServerHandlers(ipcMain)
        setLocalServerAccessors(() => getServerToken(), () => LOCAL_SERVER_PORT)
        initLegacyAssistant(ipcMain)
      },
      start: () => startLocalServer(),
      stop: () => stopLocalServer(),
    },
  ]
}

export const APP_MODULE_IDS = ['chat', 'translate', 'live', 'dictionary', 'thermal', 'launcher', 'browser-bridge'] as const
