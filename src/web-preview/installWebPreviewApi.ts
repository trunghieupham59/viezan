import { PROVIDERS } from '../constants/providers'
import type { ChatStreamEvent, WindowApi } from '../types'
import { createPreviewApps } from './previewApps'

const noopSubscription = () => () => {}
const ok = async () => ({ success: true })

const sampleTranslations: Record<string, Record<string, string>> = {
  vi: {
    'Hello, how are you?': 'Xin chào, bạn khỏe không?',
    'Good morning': 'Chào buổi sáng',
  },
  en: {
    'Xin chào, bạn khỏe không?': 'Hello, how are you?',
    'Chào buổi sáng': 'Good morning',
  },
  ja: {
    'Hello, how are you?': 'こんにちは、お元気ですか？',
    'Xin chào, bạn khỏe không?': 'こんにちは、お元気ですか？',
  },
}

function previewTranslation(text: string, targetLang: string): string {
  const exact = sampleTranslations[targetLang]?.[text.trim()]
  if (exact) return exact
  return `[${targetLang.toUpperCase()} preview] ${text.trim()}`
}

function detectPreviewLanguage(text: string): string {
  if (/[ぁ-んァ-ン一-龯]/u.test(text)) return 'ja'
  if (/[À-ỹ]/u.test(text)) return 'vi'
  return 'en'
}

/** Illustrative USD-based rates so the launcher's currency row renders in Web Preview. */
const previewCurrencyRates: Record<string, number> = { USD: 1, VND: 25_400, JPY: 150, EUR: 0.92, GBP: 0.78, KRW: 1_380, CNY: 7.2 }
let previewCurrencyTarget: string | null = null

/** Quick AI session survives reloads only in memory in Web Preview. */
const previewEnabledModules: import('../../shared/modules').ModuleEnabledState = { chat: true, translate: true, live: true, dictionary: true, thermal: true, apps: true, launcher: true, 'browser-bridge': true }

/** Fake sensors for the Thermal page: a slow random walk around plausible laptop values. */
function createPreviewThermal() {
  type Snapshot = import('../../shared/thermalApi').ThermalSnapshot
  const listeners = new Set<(snapshot: Snapshot) => void>()
  const base: Array<[string, import('../../shared/thermalApi').ThermalSensorGroup, import('../../shared/thermalApi').ThermalSensorLabel, number]> = [
    ['Tp01', 'cpu', 'cpu-performance-core', 52], ['Tp05', 'cpu', 'cpu-performance-core', 49], ['Te01', 'cpu', 'cpu-efficiency-core', 44],
    ['Tg05', 'gpu', 'gpu', 47], ['Tg0D', 'gpu', 'gpu', 46],
    ['TB1T', 'other', 'battery', 30], ['TW0P', 'other', 'wifi', 38], ['TaLP', 'other', 'airflow-left', 36], ['TH0x', 'other', 'storage', 29],
  ]
  const drift = base.map(() => 0)
  // Two fans like a 14"/16" MacBook Pro (left/right), each with its own slow drift.
  const fanRpm = [1800, 1650]
  const FAN_RANGES = [{ minRpm: 1500, maxRpm: 5500 }, { minRpm: 1500, maxRpm: 5800 }]
  let timer: ReturnType<typeof setInterval> | null = null
  const snapshot = (): Snapshot => {
    const sensors = base.map(([code, group, label, value], i) => {
      drift[i] = Math.max(-6, Math.min(12, drift[i] + (Math.random() - 0.5) * 1.5))
      return { id: `preview:${code}`, code, group, label, celsius: Math.round((value + drift[i]) * 10) / 10 }
    })
    for (let i = 0; i < fanRpm.length; i++) fanRpm[i] = Math.max(FAN_RANGES[i].minRpm, Math.min(FAN_RANGES[i].maxRpm, fanRpm[i] + (Math.random() - 0.5) * 120))
    return {
      timestamp: Date.now(), source: 'smc', sensors,
      model: 'MacBookPro18,2',
      fans: fanRpm.map((rpm, index) => ({ id: `preview:fan${index}`, index, label: (['left', 'right'] as const)[index], rpm: Math.round(rpm), ...FAN_RANGES[index], targetRpm: Math.round(rpm) })),
      cpuLoadPercent: Math.round(10 + Math.random() * 30),
    }
  }
  type Settings = import('../../shared/thermalApi').ThermalSettings
  type FanState = import('../../shared/thermalApi').FanControlState
  let settings: Settings = { tray: { enabled: false, metric: 'hottest', showFan: false, layout: 'inline', showUnit: true, fanFormat: 'rpm' }, fanControl: { acknowledged: false, autoEnable: false, custom: {} }, fanProfiles: { activeId: null, user: [] }, fanAffinity: null }
  const settingsListeners = new Set<(settings: Settings) => void>()
  // Fan control: a pretend helper that connects after a short delay and holds one fan.
  let fanState: FanState = { helper: 'idle', install: 'not-installed', fans: [] }
  const fanListeners = new Set<(state: FanState) => void>()
  const setFanState = (next: FanState) => { fanState = next; for (const cb of fanListeners) cb(next) }
  type PreviewFan = import('../../shared/thermalApi').FanControlFan
  const previewFan = (index: number, mode: 'auto' | 'fixed', targetRpm?: number): PreviewFan => ({
    id: `preview:fan${index}`, index, mode, ...(mode === 'fixed' && targetRpm !== undefined ? { targetRpm } : {}), ...FAN_RANGES[index], currentRpm: Math.round(fanRpm[index]),
  })
  const allAuto = () => fanRpm.map((_, index) => previewFan(index, 'auto'))
  type SensorRule = import('../../shared/thermalApi').FanSensorRule
  const sensorRules = new Map<number, SensorRule>()
  /** Re-evaluate sensor-driven fans against a snapshot, like main's fan policy does. */
  // The hottest sensor a rule source stands for: group:*, label:*, or a raw id (mirrors electron/thermal/fanCurve.ts).
  const resolveSource = (sensors: Snapshot['sensors'], sourceId: string) => {
    const matches = sourceId.startsWith('group:')
      ? (sourceId === 'group:all' ? sensors : sensors.filter((sensor) => sensor.group === sourceId.slice('group:'.length)))
      : sourceId.startsWith('label:') ? sensors.filter((sensor) => sensor.label === sourceId.slice('label:'.length)) : sensors.filter((sensor) => sensor.id === sourceId)
    return matches.reduce<Snapshot['sensors'][number] | undefined>((best, sensor) => (!best || sensor.celsius > best.celsius ? sensor : best), undefined)
  }
  const driveFans = (sensors: Snapshot['sensors']) => {
    if (fanState.helper !== 'ready' || sensorRules.size === 0) return
    const fans = fanState.fans.map((fan, index) => {
      const rule = sensorRules.get(index)
      const reading = rule ? resolveSource(sensors, rule.sensorId) : undefined
      if (!rule) return fan
      const range = FAN_RANGES[index]
      const fraction = reading ? Math.max(0, Math.min(1, (reading.celsius - rule.minCelsius) / (rule.maxCelsius - rule.minCelsius))) : 0
      const targetRpm = Math.round((range.minRpm + fraction * (range.maxRpm - range.minRpm)) / 50) * 50
      return { ...previewFan(index, 'fixed', targetRpm), mode: 'sensor' as const, sensor: rule, ...(reading ? { sensorCelsius: reading.celsius } : {}) }
    })
    setFanState({ ...fanState, fans })
  }
  const fanOk = () => ({ success: true, state: fanState })
  // Profiles: the same built-ins main ships, resolved against the preview sensors.
  type Profile = import('../../shared/thermalApi').FanProfile
  type ProfilesState = import('../../shared/thermalApi').FanProfilesState
  const builtinProfiles: Profile[] = [
    { id: 'builtin:system', name: 'System', builtin: true, fans: { '*': { mode: 'auto' } } },
    { id: 'builtin:quiet', name: 'Quiet', builtin: true, fans: { '*': { mode: 'sensor-group', group: 'cpu', minCelsius: 70, maxCelsius: 100 } } },
    { id: 'builtin:cool', name: 'Cool', builtin: true, fans: { '*': { mode: 'sensor-group', group: 'cpu', minCelsius: 45, maxCelsius: 75 } } },
    { id: 'builtin:gaming', name: 'Gaming', builtin: true, fans: { '*': { mode: 'sensor-group', group: 'gpu', minCelsius: 50, maxCelsius: 80 } } },
    { id: 'builtin:local-ai', name: 'Local AI', builtin: true, fans: { '*': { mode: 'sensor-group', group: 'cpu', minCelsius: 45, maxCelsius: 70 } } },
  ]
  let profiles: ProfilesState = { activeId: null, applied: false, profiles: builtinProfiles }
  const profileListeners = new Set<(state: ProfilesState) => void>()
  const setProfiles = (next: ProfilesState) => { profiles = next; for (const cb of profileListeners) cb(next) }
  const profilesOk = () => ({ success: true, state: profiles })
  const markCustom = () => { if (profiles.activeId !== null || profiles.applied) setProfiles({ ...profiles, activeId: null, applied: false }) }
  // Calibration: a fast pretend run (a few seconds per fan) that ends with each fan "cooling" its side.
  type CalibrationState = import('../../shared/thermalApi').FanCalibrationState
  let calibration: CalibrationState = { status: 'idle' }
  const calibrationListeners = new Set<(state: CalibrationState) => void>()
  const setCalibration = (next: CalibrationState) => { calibration = next; for (const cb of calibrationListeners) cb(next) }
  let calibrationTimer: ReturnType<typeof setInterval> | null = null
  const calibrationOk = () => ({ success: true, state: calibration })
  return {
    getSupport: async () => ({ success: true, support: { supported: true, source: 'smc' as const, trayPlacement: 'menu-bar' as const } }),
    read: async () => ({ success: true, snapshot: snapshot() }),
    setMonitoring: async (active: boolean) => {
      if (timer) { clearInterval(timer); timer = null }
      if (active) timer = setInterval(() => { const s = snapshot(); driveFans(s.sensors); for (const cb of listeners) cb(s) }, 2000)
      return { success: true }
    },
    onSnapshot: (cb: (snapshot: Snapshot) => void) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    onError: noopSubscription,
    getSettings: async () => ({ success: true, settings }),
    updateSettings: async (patch: import('../../shared/thermalApi').ThermalSettingsPatch) => {
      settings = { tray: { ...settings.tray, ...(patch.tray ?? {}) }, fanControl: { ...settings.fanControl, ...(patch.fanControl ?? {}) }, fanProfiles: { ...settings.fanProfiles, ...(patch.fanProfiles ?? {}) }, fanAffinity: patch.fanAffinity !== undefined ? patch.fanAffinity : settings.fanAffinity }
      for (const cb of settingsListeners) cb(settings)
      return { success: true, settings }
    },
    onSettingsChanged: (cb: (settings: Settings) => void) => { settingsListeners.add(cb); return () => { settingsListeners.delete(cb) } },
    fanControl: {
      getState: async () => fanOk(),
      enable: async () => {
        if (fanState.helper === 'ready') return fanOk()
        setFanState({ helper: 'starting', install: fanState.install, fans: [] })
        await new Promise((resolve) => setTimeout(resolve, 600))
        setFanState({ helper: 'ready', install: 'installed', helperVersion: 'preview', fans: allAuto() })
        return fanOk()
      },
      installHelper: async () => {
        sensorRules.clear()
        setFanState({ helper: 'starting', install: fanState.install, fans: [] })
        await new Promise((resolve) => setTimeout(resolve, 600))
        setFanState({ helper: 'ready', install: 'installed', helperVersion: 'preview', fans: allAuto() })
        return fanOk()
      },
      openHelperApproval: async () => ({ success: true }),
      uninstallHelper: async () => {
        sensorRules.clear()
        setFanState({ helper: 'idle', install: 'not-installed', fans: [] })
        if (profiles.applied) setProfiles({ ...profiles, applied: false })
        return fanOk()
      },
      setFan: async (fanId: string, command: import('../../shared/thermalApi').FanCommand) => {
        if (fanState.helper !== 'ready') return { success: false, error: 'Helper is not connected.' }
        const index = fanState.fans.findIndex((fan) => fan.id === fanId)
        if (index === -1) return { success: false, error: `No fan ${fanId}.` }
        const range = FAN_RANGES[index]
        if (command.mode === 'fixed' && (command.rpm < range.minRpm || command.rpm > range.maxRpm)) return { success: false, error: `Target is outside ${range.minRpm}–${range.maxRpm} RPM.` }
        if (command.mode === 'sensor') {
          const { mode: _mode, ...rule } = command
          sensorRules.set(index, rule)
          const fans = fanState.fans.map((fan, i) => (i === index ? { ...previewFan(i, 'auto'), mode: 'sensor' as const, sensor: rule } : fan))
          setFanState({ ...fanState, lastRestoreReason: undefined, fans })
          driveFans(snapshot().sensors)
          return fanOk()
        }
        sensorRules.delete(index)
        const fans = fanState.fans.map((fan, i) => (i === index ? (command.mode === 'fixed' ? previewFan(i, 'fixed', command.rpm) : previewFan(i, 'auto')) : fan))
        setFanState({ ...fanState, lastRestoreReason: undefined, fans })
        markCustom()
        return fanOk()
      },
      restoreAll: async () => {
        if (fanState.helper !== 'ready') return { success: false, error: 'Helper is not connected.' }
        sensorRules.clear()
        setFanState({ ...fanState, lastRestoreReason: 'client', fans: allAuto() })
        markCustom()
        return fanOk()
      },
      disable: async () => { sensorRules.clear(); setFanState({ helper: 'idle', install: fanState.install, fans: [] }); if (profiles.applied) setProfiles({ ...profiles, applied: false }); return fanOk() },
      calibration: {
        get: async () => calibrationOk(),
        start: async () => {
          if (fanState.helper !== 'ready') return { success: false, error: 'Fan control is not connected.' }
          if (calibration.status === 'running') return { success: false, error: 'Calibration is already running.' }
          const fans = fanState.fans.map((fan) => fan.id)
          const phases: Array<import('../../shared/thermalApi').FanCalibrationPhase> = ['baseline', 'spin', 'settle']
          let tick = 0
          const perPhase = 3
          const total = fans.length * phases.length * perPhase
          const step = () => {
            if (tick >= total) {
              if (calibrationTimer) { clearInterval(calibrationTimer); calibrationTimer = null }
              const result = {
                calibratedAt: Date.now(), model: 'MacBookPro18,2',
                fans: fans.map((fanId, index) => ({ fanId, sensors: index === 0
                  ? [{ sensorId: 'preview:Tp01', cooling: 6.2, share: 0.8, contrast: 4.7 }, { sensorId: 'preview:Tp05', cooling: 4.1, share: 0.7, contrast: 2.3 }, { sensorId: 'preview:Tg05', cooling: 1.2, share: 0.3, contrast: -1.6 }]
                  : [{ sensorId: 'preview:Te01', cooling: 3.9, share: 0.9, contrast: 3.5 }, { sensorId: 'preview:Tg0D', cooling: 2.8, share: 0.7, contrast: 1.6 }, { sensorId: 'preview:TH0x', cooling: 1.0, share: 1, contrast: 1.0 }] })),
              }
              settings = { ...settings, fanAffinity: result }
              setCalibration({ status: 'done', result })
              return
            }
            const fanIndex = Math.floor(tick / (phases.length * perPhase))
            const phase = phases[Math.floor((tick % (phases.length * perPhase)) / perPhase)]
            setCalibration({ status: 'running', fanIndex, fanCount: fans.length, fanId: fans[fanIndex], phase, secondsLeft: perPhase - (tick % perPhase), progress: tick / total, result: calibration.result })
            tick += 1
          }
          step()
          calibrationTimer = setInterval(step, 1000)
          return calibrationOk()
        },
        cancel: async () => {
          if (calibrationTimer) { clearInterval(calibrationTimer); calibrationTimer = null }
          if (calibration.status === 'running') setCalibration({ status: 'cancelled', result: calibration.result })
          return calibrationOk()
        },
        clear: async () => { settings = { ...settings, fanAffinity: null }; setCalibration({ status: 'idle' }); return calibrationOk() },
        onState: (cb: (state: CalibrationState) => void) => { calibrationListeners.add(cb); return () => { calibrationListeners.delete(cb) } },
      },
      profiles: {
        get: async () => profilesOk(),
        apply: async (id: string) => {
          const profile = profiles.profiles.find((candidate) => candidate.id === id)
          if (!profile) return { success: false, error: `No profile ${id}.` }
          if (fanState.helper !== 'ready') return { success: false, error: 'Fan control is not connected.' }
          const sensors = snapshot().sensors
          fanState.fans.forEach((fan, index) => {
            const entry = profile.fans[fan.id] ?? profile.fans['*']
            if (!entry) return
            if (entry.mode === 'sensor-group') {
              sensorRules.set(index, { sensorId: `group:${entry.group}`, minCelsius: entry.minCelsius, maxCelsius: entry.maxCelsius })
            } else {
              sensorRules.delete(index)
            }
          })
          setFanState({ ...fanState, lastRestoreReason: undefined, fans: fanState.fans.map((fan, index) => {
            const entry = profile.fans[fan.id] ?? profile.fans['*']
            if (!entry || entry.mode === 'auto') return previewFan(index, 'auto')
            if (entry.mode === 'fixed') return previewFan(index, 'fixed', entry.rpm)
            const rule = sensorRules.get(index)
            return rule ? { ...previewFan(index, 'auto'), mode: 'sensor' as const, sensor: rule } : previewFan(index, 'auto')
          }) })
          driveFans(sensors)
          setProfiles({ ...profiles, activeId: id, applied: true })
          return profilesOk()
        },
        saveCurrent: async (name: string) => {
          const id = `user:preview-${Date.now()}`
          const fans = Object.fromEntries(fanState.fans.map((fan) => [fan.id, fan.mode === 'sensor' && fan.sensor ? { mode: 'sensor' as const, ...fan.sensor } : fan.mode === 'fixed' && fan.targetRpm !== undefined ? { mode: 'fixed' as const, rpm: fan.targetRpm } : { mode: 'auto' as const }]))
          setProfiles({ activeId: id, applied: true, profiles: [...profiles.profiles, { id, name: name.trim(), builtin: false, fans }] })
          return profilesOk()
        },
        remove: async (id: string) => {
          setProfiles({ ...profiles, activeId: profiles.activeId === id ? null : profiles.activeId, applied: profiles.activeId === id ? false : profiles.applied, profiles: profiles.profiles.filter((profile) => profile.id !== id) })
          return profilesOk()
        },
        onState: (cb: (state: ProfilesState) => void) => { profileListeners.add(cb); return () => { profileListeners.delete(cb) } },
      },
      onState: (cb: (state: FanState) => void) => { fanListeners.add(cb); return () => { fanListeners.delete(cb) } },
    },
  }
}
const previewThermal = createPreviewThermal()
let previewQuickAiSession: import('../../shared/quickAi').QuickAiSession | null = null

function createWebPreviewApi(): WindowApi {
  const keys = new Map<string, string>()
  const streamListeners = new Map<string, (event: ChatStreamEvent) => void>()
  const modelList = PROVIDERS.flatMap(provider => provider.models.map(model => ({ ...model })))

  const api = {
    keychain: {
      save: async (provider: string, key: string) => { keys.set(provider, key); return { success: true } },
      get: async (provider: string) => ({ success: true, exists: keys.has(provider), masked: keys.has(provider) ? '••••preview' : null }),
      delete: async (provider: string) => { keys.delete(provider); return { success: true } },
      hasKey: async (provider: string) => ({ exists: keys.has(provider) || provider === 'local' }),
    },
    fetchModels: async (provider: string) => {
      const config = PROVIDERS.find(item => item.id === provider)
      return { success: true, models: config?.models ?? modelList, recommendedModel: config?.models[0]?.id }
    },
    discoverLocalAi: async () => ({ success: true, available: true, engine: 'ollama', models: PROVIDERS[0].models, suggestedModels: PROVIDERS[0].models, hardware: { platform: 'web', arch: 'preview', cpuCount: 8, totalMemoryGb: 16, tier: 'balanced' } }),
    ensureLocalAiRuntime: async () => api.discoverLocalAi(),
    benchmarkLocalAi: async () => ({ hardware: { platform: 'web', arch: 'preview', cpuCount: 8, totalMemoryGb: 16, tier: 'balanced' }, suggestedModels: PROVIDERS[0].models, metrics: { cpuScore: 100, memoryScore: 100, combinedScore: 100, durationMs: 1 } }),
    getLocalAiPerformance: async () => ({}),
    compareLocalAiPerformance: async () => { throw new Error('Performance comparison requires the desktop app.') },
    selectLocalAiPerformance: async () => { throw new Error('Performance configuration requires the desktop app.') },
    cancelLocalAiPerformance: async () => undefined,
    downloadLocalAiModel: async (modelId: string) => ({ success: true, model: modelId }),
    uninstallLocalAiModel: async (modelId: string) => ({ success: true, model: modelId }),
    onLocalAiModelDownloadProgress: noopSubscription,
    installOllama: async () => ({ success: false, error: 'Desktop only in Web Preview' }),
    verifyKey: async () => ({ success: true, valid: true }),
    translate: async (params: { sourceText: string; targetLang: string }) => ({ success: true, translatedText: previewTranslation(params.sourceText, params.targetLang) }),
    cancelTranslate: ok,
    rewriteText: async (params: { text: string }) => ({ success: true, translatedText: `[Rewritten preview] ${params.text.trim()}` }),
    detectLanguage: async (params: { text: string }) => ({ success: true, lang: detectPreviewLanguage(params.text) }),
    transcribeAudio: async () => ({
      success: true as const,
      text: 'This is a simulated transcript for Web Preview.',
      usedProvider: 'whisper' as const,
    }),
    cancelAudioTranscription: async () => ({ success: true as const, cancelled: false }),
    liveInterpretation: {
      begin: async () => undefined,
      cancel: async () => undefined,
      assemble: async () => ({ success: true as const, updates: [], hasOpen: false }),
      translate: async (params: { sourceText: string; targetLang: string }) => ({
        success: true as const, translatedText: previewTranslation(params.sourceText, params.targetLang),
        cached: false, attempts: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: true },
      }),
    },
    speakText: async () => ({ success: false, error: 'Audio playback requires the desktop app.' }),
    translateImage: async () => ({ success: true, regions: [{ x: 0.1, y: 0.1, width: 0.8, height: 0.15, originalText: 'Sample image text', translatedText: 'Văn bản ảnh mẫu', fontSize: 0.05, bgColor: '#ffffff', textColor: '#111111' }] }),
    onImageModelSwitched: noopSubscription,
    webSearch: async ({ query }: { query: string }) => ({ success: true, provider: 'jina', answer: `Preview search results for “${query}”`, results: [{ title: 'Web Preview result', url: 'https://example.com', content: 'Deterministic mock content for UI development.', score: 1 }] }),
    webSearchVerify: async () => ({ valid: true }),
    chat: async () => ({ success: true, reply: 'This is a deterministic Web Preview response. The desktop app will use the selected AI provider.' }),
    editChatImage: async () => ({ success: false, error: 'Image editing requires the desktop app.' }),
    generateChatImage: async () => ({ success: false, error: 'Image generation requires the desktop app.' }),
    chatStream: async ({ requestId }: { requestId: string }) => {
      const reply = 'This is a streamed Web Preview response.'
      queueMicrotask(() => {
        const emit = streamListeners.get(requestId)
        emit?.({ requestId, type: 'start' })
        emit?.({ requestId, type: 'token', token: reply })
        emit?.({ requestId, type: 'end', reply })
      })
      return { success: true, reply }
    },
    chatStreamCancel: ok,
    onChatStreamEvent: (requestId: string, callback: (event: ChatStreamEvent) => void) => {
      streamListeners.set(requestId, callback)
      return () => streamListeners.delete(requestId)
    },
    checkScreenPermission: async () => 'denied',
    openExternal: async (url: string) => { window.open(url, '_blank', 'noopener,noreferrer') },
    relaunchApp: async () => undefined,
    getLoginItemSettings: async () => ({ supported: false, openAtLogin: false }),
    setLoginItemSettings: async () => ({ success: false, openAtLogin: false, error: 'Desktop only in Web Preview' }),
    checkSttProviders: async () => ({ primary: 'whisper', available: ['whisper'] }),
    translateStream: async (params: { sourceText: string; targetLang: string }) => ({ success: true, translatedText: previewTranslation(params.sourceText, params.targetLang) }),
    subtitle: { show: async () => undefined, hide: async () => undefined, update: async () => undefined, setStyle: async () => undefined, setSourceText: async () => undefined, pushState: async () => undefined, onClosed: noopSubscription, onStart: noopSubscription, onStop: noopSubscription, onSetProvider: noopSubscription, onSetModel: noopSubscription, onSetAudioMode: noopSubscription, onSetTargetLang: noopSubscription, onStyleUpdate: noopSubscription, onClear: noopSubscription },
    platform: 'web',
    version: 'web-preview',
    modules: {
      // In-memory only: the preview has no main process to persist or start/stop modules.
      get: async () => ({ success: true, enabled: { ...previewEnabledModules } }),
      setEnabled: async (id: string, enabled: boolean) => {
        if (!(id in previewEnabledModules)) return { success: false, error: 'Unknown module.' }
        previewEnabledModules[id as keyof typeof previewEnabledModules] = enabled
        return { success: true, enabled: { ...previewEnabledModules } }
      },
      onChanged: noopSubscription,
    },
    apps: createPreviewApps(),
    thermal: previewThermal,
    capabilities: {
      get: async (ids?: string[]) => ({ success: true, statuses: (ids ?? ['input.accessibility', 'launcher.spotlight']).map((id) => ({ id, supported: false, permission: 'not-required' as const })) }),
      request: async (id: string) => ({ success: true, status: { id, supported: false, permission: 'not-required' as const } }),
    },
    hotkey: { update: async (settings: Record<string, unknown>) => ({ success: true, settings }), get: async () => ({ success: true, settings: {} }), disable: ok, onTranslating: noopSubscription, onTranslated: noopSubscription, onError: noopSubscription, chat: { update: async (settings: Record<string, unknown>) => ({ success: true, settings }), get: async () => ({ success: true, settings: {} }), systemConflict: async () => ({ success: true, hotkey: '', enabled: false, conflict: null }), spotlight: { get: async () => ({ success: true, shouldPrompt: false, disabledByViezan: false }), resolve: async () => ({ success: true, applied: true }), restore: async () => ({ success: true, applied: true }) }, onOpen: noopSubscription } },
    quickChat: {
      setLayout: ok,
      session: {
        get: async () => ({ success: true, session: previewQuickAiSession }),
        save: async (session: import('../../shared/quickAi').QuickAiSession) => { previewQuickAiSession = session; return { success: true } },
        clear: async () => { previewQuickAiSession = null; return { success: true } },
      },
      launcher: {
        listApps: async () => ({ success: true, apps: [{ id: 'preview-calculator', name: 'Calculator (preview)' }, { id: 'preview-notes', name: 'Notes (preview)', aliases: ['Ghi chú'] }], recent: ['preview-notes'] }),
        getIcons: async () => ({ success: true, icons: [] }),
        onIcons: noopSubscription,
        openApp: async () => ({ success: false, errorCode: 'UNAVAILABLE' }),
        searchWeb: async () => ({ success: false, errorCode: 'UNAVAILABLE' }),
        searchFiles: async (query: string) => ({
          success: true,
          files: [
            { id: 'preview-file-1', name: 'Quarterly report.pdf', folder: '~/Documents', kind: 'file' as const },
            { id: 'preview-file-2', name: 'Projects', folder: '~/Documents', kind: 'folder' as const },
          ].filter(file => file.name.toLowerCase().includes(query.trim().toLowerCase()) && query.trim().length >= 2),
        }),
        openFile: async () => ({ success: false, errorCode: 'UNAVAILABLE' }),
        revealFile: async () => ({ success: false, errorCode: 'UNAVAILABLE' }),
        convertCurrency: async ({ amount, from, to }: { amount: number; from: string; to: string }) => {
          const fromRate = previewCurrencyRates[from]
          const toRate = previewCurrencyRates[to]
          if (!fromRate || !toRate) return { success: false, errorCode: 'NOT_FOUND' }
          const rate = toRate / fromRate
          return { success: true, conversion: { amount, from, to, rate, converted: amount * rate, rateUpdatedAt: Date.now() } }
        },
        getCurrencyTarget: async () => ({ success: true, code: previewCurrencyTarget }),
        setCurrencyTarget: async (code: string | null) => { previewCurrencyTarget = code; return { success: true } },
      },
      hide: ok, openSettings: ok, openInChat: ok, openFeature: ok, recordUsage: ok, onShow: noopSubscription, onOpenSettings: noopSubscription, onOpenInChat: noopSubscription, onOpenFeature: noopSubscription, onUsage: noopSubscription,
    },
    legacyAssistant: { get: async () => ({ success: true, settings: {} }), update: ok, getBookmarklet: async () => ({ success: true, bookmarklet: '' }), injectNow: ok },
    updater: { check: ok, download: async () => ({ success: false, error: 'Desktop only in Web Preview' }), install: async () => ({ success: false, error: 'Desktop only in Web Preview' }), openInstaller: async () => ({ success: false, error: 'Desktop only in Web Preview' }), getVersion: async () => ({ version: 'web-preview' }), openDownload: ok, onStatus: noopSubscription },
    localServer: { createToken: async () => ({ success: false, error: 'Desktop only in Web Preview' }), listTokens: async () => ({ success: true, port: 39875, tokens: [] }), deleteToken: ok, regenerateToken: async () => ({ success: false, error: 'Desktop only in Web Preview' }), syncConfig: ok },
  }

  return api as unknown as WindowApi
}

export function installWebPreviewApi(): void {
  if (import.meta.env.MODE !== 'web-preview' || window.api) return
  window.api = createWebPreviewApi()
  document.documentElement.dataset.runtime = 'web-preview'
  console.info('[Viezan] Web Preview API installed; native features are simulated.')
}
