/**
 * Vitest global test setup.
 *
 * - Provides a minimal mock of `window.api` (the Electron IPC bridge)
 *   so component/store tests can run in jsdom without Electron.
 * - Runs before every test file automatically (configured in vitest.config.ts).
 *
 * NOTE: Electron IPC tests run in Node environment where `window` is not defined.
 * All DOM-related setup is guarded so this file can be safely loaded in both
 * jsdom (src tests) and Node (electron/__tests__ tests).
 */
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import type { AudioApi } from '../../shared/audioApi'
import type { CapabilitiesApi } from '../../shared/capabilitiesApi'
import type { ChatApi } from '../../shared/chatApi'
import type { HotkeyApi } from '../../shared/hotkeyApi'
import type { KeychainApi } from '../../shared/keychainApi'
import type { LegacyAssistantApi } from '../../shared/legacyAssistantApi'
import type { LocalServerApi } from '../../shared/localServerApi'
import type { ModulesApi } from '../../shared/modules'
import type { QuickChatApi } from '../../shared/quickChatApi'
import type { SubtitleApi } from '../../shared/subtitleApi'
import type { SystemApi } from '../../shared/systemApi'
import type { ThermalApi } from '../../shared/thermalApi'
import type { TranslateApi } from '../../shared/translateApi'
import type { UpdaterApi } from '../../shared/updaterApi'
import type { WebSearchApi } from '../../shared/webSearchApi'
import { useNotificationStore } from '../store/useNotificationStore'

// Toasts live in a module-level store; drop them between tests so one test's
// notification never satisfies another test's assertion.
afterEach(() => {
  useNotificationStore.getState().clear()
})

// Only set up DOM mocks when running in a browser-like environment (jsdom).
// Electron IPC tests use @vitest-environment node which has no `window`.
if (typeof window !== 'undefined') {
  if (!window.IntersectionObserver) {
    class IntersectionObserverMock implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = '0px'
      readonly scrollMargin = '0px'
      readonly thresholds = [0]

      disconnect = vi.fn()
      observe = vi.fn()
      takeRecords = vi.fn(() => [])
      unobserve = vi.fn()
    }

    Object.defineProperty(window, 'IntersectionObserver', {
      value: IntersectionObserverMock,
      configurable: true,
    })
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: IntersectionObserverMock,
      configurable: true,
    })
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }

  // Mock localStorage — required for Zustand persist middleware in jsdom environment
  const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value }),
      removeItem: vi.fn((key: string) => { delete store[key] }),
      clear: vi.fn(() => { store = {} }),
      get length() { return Object.keys(store).length },
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    }
  })()

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })

  /**
   * Typed against the shared contracts so a method added to `shared/*Api.d.ts` without a
   * mock fails `tsc` here instead of surfacing as `undefined is not a function` in a test.
   */
  const systemApiMock: SystemApi = {
    checkScreenPermission: vi.fn().mockResolvedValue('denied'),
    openExternal: vi.fn().mockResolvedValue(undefined),
    relaunchApp: vi.fn().mockResolvedValue(undefined),
    getLoginItemSettings: vi.fn().mockResolvedValue({ supported: false, openAtLogin: false }),
    setLoginItemSettings: vi.fn().mockResolvedValue({ success: false, openAtLogin: false }),
    setWindowTheme: vi.fn().mockResolvedValue(undefined),
    platform: 'darwin',
    version: '1.0.0',
  }
  const keychainApiMock: KeychainApi = {
    save: vi.fn().mockResolvedValue({ success: true }),
    get: vi.fn().mockResolvedValue({ exists: false, masked: null }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    hasKey: vi.fn().mockResolvedValue({ exists: false }),
  }
  const webSearchApiMock: WebSearchApi = {
    webSearch: vi.fn().mockResolvedValue({ success: false, results: [] }),
    webSearchVerify: vi.fn().mockResolvedValue({ valid: false }),
  }
  const localServerApiMock: LocalServerApi = {
    createToken: vi.fn().mockResolvedValue({ success: true }),
    listTokens: vi.fn().mockResolvedValue({ success: true, port: 39875, tokens: [] }),
    deleteToken: vi.fn().mockResolvedValue({ success: true }),
    regenerateToken: vi.fn().mockResolvedValue({ success: true }),
    syncConfig: vi.fn().mockResolvedValue({ success: true }),
  }
  const legacyAssistantApiMock: LegacyAssistantApi = {
    get: vi.fn().mockResolvedValue({ success: true, settings: {} }),
    update: vi.fn().mockResolvedValue({ success: true }),
    getBookmarklet: vi.fn().mockResolvedValue({ success: true, bookmarklet: '' }),
    injectNow: vi.fn().mockResolvedValue({ success: true }),
  }
  // Native-notification members are left out on purpose: their absence selects the in-app dialog.
  const updaterApiMock: UpdaterApi = {
    check: vi.fn().mockResolvedValue({ success: true }),
    download: vi.fn().mockResolvedValue({ success: true }),
    install: vi.fn().mockResolvedValue({ success: true }),
    openInstaller: vi.fn().mockResolvedValue({ success: true }),
    getVersion: vi.fn().mockResolvedValue({ version: '1.0.0' }),
    openDownload: vi.fn().mockResolvedValue({ success: true }),
    onStatus: vi.fn().mockReturnValue(() => {}),
  }
  const subtitleApiMock: SubtitleApi = {
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    setStyle: vi.fn().mockResolvedValue(undefined),
    setSourceText: vi.fn().mockResolvedValue(undefined),
    pushState: vi.fn().mockResolvedValue(undefined),
    onClosed: vi.fn().mockReturnValue(() => {}),
    onStart: vi.fn().mockReturnValue(() => {}),
    onStop: vi.fn().mockReturnValue(() => {}),
    onSetProvider: vi.fn().mockReturnValue(() => {}),
    onSetModel: vi.fn().mockReturnValue(() => {}),
    onSetAudioMode: vi.fn().mockReturnValue(() => {}),
    onSetTargetLang: vi.fn().mockReturnValue(() => {}),
    onStyleUpdate: vi.fn().mockReturnValue(() => {}),
    onClear: vi.fn().mockReturnValue(() => {}),
  }
  const quickChatApiMock: QuickChatApi = {
    setLayout: vi.fn().mockResolvedValue({ success: true }),
    session: {
      get: vi.fn().mockResolvedValue({ success: true, session: null }),
      save: vi.fn().mockResolvedValue({ success: true }),
      clear: vi.fn().mockResolvedValue({ success: true }),
    },
    launcher: {
      listApps: vi.fn().mockResolvedValue({ success: true, apps: [] }),
      getIcons: vi.fn().mockResolvedValue({ success: true, icons: [] }),
      onIcons: vi.fn().mockReturnValue(() => {}),
      openApp: vi.fn().mockResolvedValue({ success: true }),
      searchWeb: vi.fn().mockResolvedValue({ success: true }),
      searchFiles: vi.fn().mockResolvedValue({ success: true, files: [] }),
      openFile: vi.fn().mockResolvedValue({ success: true }),
      revealFile: vi.fn().mockResolvedValue({ success: true }),
      convertCurrency: vi.fn().mockResolvedValue({ success: false, errorCode: 'UNAVAILABLE' }),
      getCurrencyTarget: vi.fn().mockResolvedValue({ success: true, code: null }),
      setCurrencyTarget: vi.fn().mockResolvedValue({ success: true }),
    },
    hide: vi.fn().mockResolvedValue({ success: true }),
    openSettings: vi.fn().mockResolvedValue({ success: true }),
    openInChat: vi.fn().mockResolvedValue({ success: true }),
    openFeature: vi.fn().mockResolvedValue({ success: true }),
    recordUsage: vi.fn().mockResolvedValue({ success: true }),
    onUsage: vi.fn().mockReturnValue(() => {}),
    onShow: vi.fn().mockReturnValue(() => {}),
    onOpenFeature: vi.fn().mockReturnValue(() => {}),
    onOpenSettings: vi.fn().mockReturnValue(() => {}),
    onOpenInChat: vi.fn().mockReturnValue(() => {}),
  }
  const audioApiMock: AudioApi = {
    liveInterpretation: {
      begin: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      translate: vi.fn().mockResolvedValue({ success: false, errorCode: 'UNKNOWN' }),
      assemble: vi.fn().mockResolvedValue({ success: true, updates: [], hasOpen: false }),
    },
    transcribeAudio: vi.fn().mockResolvedValue({
      success: false,
      errorCode: 'UNKNOWN',
      retryable: false,
    }),
    cancelAudioTranscription: vi.fn().mockResolvedValue({
      success: true,
      cancelled: false,
    }),
    speakText: vi.fn().mockResolvedValue({ success: false }),
    checkSttProviders: vi.fn().mockResolvedValue({ best: null, available: [] }),
  }
  const chatApiMock: ChatApi = {
    translateImage: vi.fn().mockResolvedValue({ success: false }),
    onImageModelSwitched: vi.fn().mockReturnValue(() => {}),
    chat: vi.fn().mockResolvedValue({ success: false }),
    editChatImage: vi.fn().mockResolvedValue({ success: false }),
    generateChatImage: vi.fn().mockResolvedValue({ success: false }),
    chatStream: vi.fn().mockResolvedValue({ success: false }),
    chatStreamCancel: vi.fn().mockResolvedValue({ success: false }),
    onChatStreamEvent: vi.fn().mockReturnValue(() => {}),
  }
  const translateApiMock: TranslateApi = {
    fetchModels: vi.fn().mockResolvedValue({ success: false, models: [] }),
    discoverLocalAi: vi.fn().mockResolvedValue({ success: false, available: false, models: [], suggestedModels: [], hardware: { platform: 'darwin', arch: 'arm64', cpuCount: 8, totalMemoryGb: 16, tier: 'powerful' } }),
    ensureLocalAiRuntime: vi.fn().mockResolvedValue({ success: false, available: false, models: [], suggestedModels: [], hardware: { platform: 'darwin', arch: 'arm64', cpuCount: 8, totalMemoryGb: 16, tier: 'powerful' } }),
    benchmarkLocalAi: vi.fn().mockResolvedValue({
      hardware: { platform: 'darwin', arch: 'arm64', cpuCount: 8, totalMemoryGb: 16, tier: 'powerful' },
      suggestedModels: [],
      metrics: { cpuScore: 100, memoryScore: 100, combinedScore: 100, durationMs: 300 },
    }),
    downloadLocalAiModel: vi.fn().mockResolvedValue({ success: false, model: '' }),
    uninstallLocalAiModel: vi.fn().mockResolvedValue({ success: false, model: '' }),
    onLocalAiModelDownloadProgress: vi.fn().mockReturnValue(() => {}),
    installOllama: vi.fn().mockResolvedValue({ success: false }),
    verifyKey: vi.fn().mockResolvedValue({ success: false }),
    translate: vi.fn().mockResolvedValue({ success: false }),
    cancelTranslate: vi.fn().mockResolvedValue({ success: false, error: 'NOT_FOUND' }),
    rewriteText: vi.fn().mockResolvedValue({ success: false }),
    translateStream: vi.fn().mockResolvedValue({ success: false }),
    getLocalAiPerformance: vi.fn().mockResolvedValue({}),
    compareLocalAiPerformance: vi.fn().mockResolvedValue({}),
    selectLocalAiPerformance: vi.fn().mockResolvedValue({}),
    cancelLocalAiPerformance: vi.fn().mockResolvedValue(undefined),
    getLocalAiActiveDownloads: vi.fn().mockResolvedValue([]),
    cancelModelDownload: vi.fn().mockResolvedValue({ success: false }),
    detectLanguage: vi.fn().mockResolvedValue({ success: false }),
  }
  const modulesApiMock: ModulesApi = {
    get: vi.fn().mockResolvedValue({ success: true, enabled: { chat: true, translate: true, live: true, dictionary: true, thermal: true, launcher: true, 'browser-bridge': true } }),
    setEnabled: vi.fn().mockResolvedValue({ success: true }),
    onChanged: vi.fn().mockReturnValue(() => {}),
  }
  const thermalApiMock: ThermalApi = {
    getSupport: vi.fn().mockResolvedValue({ success: true, support: { supported: true, source: 'smc' } }),
    read: vi.fn().mockResolvedValue({ success: true, snapshot: { timestamp: 0, source: 'smc', sensors: [], fans: [] } }),
    setMonitoring: vi.fn().mockResolvedValue({ success: true }),
    onSnapshot: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
    getSettings: vi.fn().mockResolvedValue({ success: true, settings: { tray: { enabled: false, metric: 'hottest', showFan: false, layout: 'inline', showUnit: true, fanFormat: 'rpm' }, fanControl: { acknowledged: false } } }),
    updateSettings: vi.fn().mockResolvedValue({ success: true, settings: { tray: { enabled: false, metric: 'hottest', showFan: false, layout: 'inline', showUnit: true, fanFormat: 'rpm' }, fanControl: { acknowledged: false } } }),
    onSettingsChanged: vi.fn().mockReturnValue(() => {}),
    fanControl: {
      getState: vi.fn().mockResolvedValue({ success: true, state: { helper: 'unsupported', fans: [] } }),
      enable: vi.fn().mockResolvedValue({ success: true, state: { helper: 'unsupported', fans: [] } }),
      setFan: vi.fn().mockResolvedValue({ success: true, state: { helper: 'unsupported', fans: [] } }),
      restoreAll: vi.fn().mockResolvedValue({ success: true, state: { helper: 'unsupported', fans: [] } }),
      disable: vi.fn().mockResolvedValue({ success: true, state: { helper: 'unsupported', fans: [] } }),
      onState: vi.fn().mockReturnValue(() => {}),
      profiles: {
        get: vi.fn().mockResolvedValue({ success: true, state: { activeId: null, applied: false, profiles: [] } }),
        apply: vi.fn().mockResolvedValue({ success: true, state: { activeId: null, applied: false, profiles: [] } }),
        saveCurrent: vi.fn().mockResolvedValue({ success: true, state: { activeId: null, applied: false, profiles: [] } }),
        remove: vi.fn().mockResolvedValue({ success: true, state: { activeId: null, applied: false, profiles: [] } }),
        onState: vi.fn().mockReturnValue(() => {}),
      },
      calibration: {
        get: vi.fn().mockResolvedValue({ success: true, state: { status: 'idle' } }),
        start: vi.fn().mockResolvedValue({ success: true, state: { status: 'running' } }),
        cancel: vi.fn().mockResolvedValue({ success: true, state: { status: 'cancelled' } }),
        clear: vi.fn().mockResolvedValue({ success: true, state: { status: 'idle' } }),
        onState: vi.fn().mockReturnValue(() => {}),
      },
    },
  }
  const capabilitiesApiMock: CapabilitiesApi = {
    get: vi.fn().mockResolvedValue({ success: true, statuses: [] }),
    request: vi.fn().mockResolvedValue({ success: true, status: { id: 'input.accessibility', supported: true, permission: 'granted' } }),
  }
  const hotkeyApiMock: HotkeyApi = {
    update: vi.fn().mockResolvedValue({ success: true }),
    get: vi.fn().mockResolvedValue({ success: true, settings: {} }),
    disable: vi.fn().mockResolvedValue({ success: true }),
    onTranslating: vi.fn().mockReturnValue(() => {}),
    onTranslated: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
    chat: {
      update: vi.fn().mockResolvedValue({ success: true }),
      get: vi.fn().mockResolvedValue({ success: true, settings: {} }),
      systemConflict: vi.fn().mockResolvedValue({ success: true, hotkey: '', enabled: false, conflict: null }),
      spotlight: {
        get: vi.fn().mockResolvedValue({ success: true, shouldPrompt: false, disabledByViezan: false }),
        resolve: vi.fn().mockResolvedValue({ success: true, applied: true }),
        restore: vi.fn().mockResolvedValue({ success: true, applied: true }),
      },
      onOpen: vi.fn().mockReturnValue(() => {}),
    },
  }

  // Mock window.api — the Electron context bridge is not available in jsdom.
  // Tests that need specific return values should override individual mocks per test.
  Object.defineProperty(window, 'api', {
    value: {
      ...audioApiMock,
      ...chatApiMock,
      ...translateApiMock,
      ...systemApiMock,
      ...webSearchApiMock,
      keychain: keychainApiMock,
      subtitle: subtitleApiMock,
      capabilities: capabilitiesApiMock,
      modules: modulesApiMock,
      thermal: thermalApiMock,
      hotkey: hotkeyApiMock,
      quickChat: quickChatApiMock,
      legacyAssistant: legacyAssistantApiMock,
      updater: updaterApiMock,
      localServer: localServerApiMock,
    },
    writable: true,
    configurable: true,
  })
}
