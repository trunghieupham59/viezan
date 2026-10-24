/**
 * IPC channel names shared by the main-process handlers and the preload sections.
 * One constant per channel keeps the two sides from drifting; the method shapes
 * themselves live in `shared/*Api.d.ts`.
 */

export const HOTKEY_CHANNELS = {
  invoke: {
    update: 'hotkey:update',
    get: 'hotkey:get',
    disable: 'hotkey:disable',
    chatUpdate: 'hotkey:chat:update',
    chatGet: 'hotkey:chat:get',
    chatSystemConflict: 'hotkey:chat:systemConflict',
    spotlightGet: 'hotkey:chat:spotlight:get',
    spotlightResolve: 'hotkey:chat:spotlight:resolve',
    spotlightRestore: 'hotkey:chat:spotlight:restore',
  },
  event: {
    translating: 'hotkey:translating',
    translated: 'hotkey:translated',
    error: 'hotkey:error',
    chatOpen: 'hotkey:chat-open',
  },
} as const

export const SYSTEM_CHANNELS = {
  invoke: {
    checkScreenPermission: 'app:checkScreenPermission',
    openExternal: 'app:openExternal',
    relaunch: 'app:relaunch',
    getLoginItemSettings: 'app:getLoginItemSettings',
    setLoginItemSettings: 'app:setLoginItemSettings',
    setWindowTheme: 'app:setWindowTheme',
  },
} as const

export const KEYCHAIN_CHANNELS = {
  invoke: {
    save: 'keychain:save',
    get: 'keychain:get',
    delete: 'keychain:delete',
    hasKey: 'keychain:hasKey',
  },
} as const

export const WEBSEARCH_CHANNELS = {
  invoke: {
    search: 'websearch:search',
    verify: 'websearch:verify',
    /** Provider configuration status; served by main, not exposed on window.api today. */
    status: 'websearch:status',
  },
} as const

export const LOCAL_SERVER_CHANNELS = {
  invoke: {
    createToken: 'localServer:createToken',
    listTokens: 'localServer:listTokens',
    deleteToken: 'localServer:deleteToken',
    regenerateToken: 'localServer:regenerateToken',
    syncConfig: 'localServer:syncConfig',
  },
} as const

export const LEGACY_ASSISTANT_CHANNELS = {
  invoke: {
    get: 'legacyAssistant:get',
    update: 'legacyAssistant:update',
    getBookmarklet: 'legacyAssistant:getBookmarklet',
    injectNow: 'legacyAssistant:injectNow',
  },
} as const

export const UPDATER_CHANNELS = {
  invoke: {
    consumeOpenSettings: 'updater:consumeOpenSettings',
    notificationPreferences: 'updater:notificationPreferences',
    setNotificationPreferences: 'updater:setNotificationPreferences',
    getStatus: 'updater:getStatus',
    check: 'updater:check',
    download: 'updater:download',
    install: 'updater:install',
    openInstaller: 'updater:openInstaller',
    getVersion: 'updater:getVersion',
    openDownload: 'updater:openDownload',
  },
  event: {
    openSettings: 'updater:openSettings',
    status: 'updater:status',
  },
} as const

export const SUBTITLE_CHANNELS = {
  invoke: {
    show: 'subtitle:show',
    hide: 'subtitle:hide',
    update: 'subtitle:update',
    setStyle: 'subtitle:setStyle',
    setSourceText: 'subtitle:setSourceText',
    setState: 'subtitle:setState',
  },
  /** `closed` and the `action*` events flow from the subtitle window to the main renderer. */
  event: {
    closed: 'subtitle:closed',
    actionStart: 'subtitle:action:start',
    actionStop: 'subtitle:action:stop',
    actionSetProvider: 'subtitle:action:setProvider',
    actionSetModel: 'subtitle:action:setModel',
    actionSetAudioMode: 'subtitle:action:setAudioMode',
    actionSetTargetLang: 'subtitle:action:setTargetLang',
    actionUpdateStyle: 'subtitle:action:updateStyle',
    actionClear: 'subtitle:action:clear',
  },
} as const

export const QUICK_CHAT_CHANNELS = {
  invoke: {
    recordUsage: 'quick-chat:record-usage',
    sessionGet: 'quick-chat:session:get',
    sessionSave: 'quick-chat:session:save',
    sessionClear: 'quick-chat:session:clear',
    setLayout: 'quick-chat:set-layout',
    hide: 'quick-chat:hide',
    openSettings: 'quick-chat:open-settings',
    openInChat: 'quick-chat:open-in-chat',
    openFeature: 'quick-chat:open-feature',
  },
  /** Events pushed to the main window (usage, open-*) or to the popup (show). `openSettings` and `openFeature` are both an invoke from the popup and a push to the main window. */
  event: {
    usage: 'quick-chat:usage',
    show: 'quick-chat:show',
    openSettings: 'quick-chat:open-settings',
    openFeature: 'quick-chat:open-feature',
    openInMainChat: 'quick-chat:open-in-main-chat',
  },
} as const

export const LAUNCHER_CHANNELS = {
  invoke: {
    listApps: 'launcher:list-apps',
    getIcons: 'launcher:get-icons',
    openApp: 'launcher:open-app',
    searchWeb: 'launcher:search-web',
    searchFiles: 'launcher:search-files',
    openFile: 'launcher:open-file',
    revealFile: 'launcher:reveal-file',
    convertCurrency: 'launcher:convert-currency',
    getCurrencyTarget: 'launcher:get-currency-target',
    setCurrencyTarget: 'launcher:set-currency-target',
  },
  event: {
    icons: 'launcher:icons',
  },
} as const

export const AUDIO_CHANNELS = {
  invoke: {
    transcribe: 'audio:transcribe',
    cancelTranscription: 'audio:cancelTranscription',
    checkSttProviders: 'audio:checkSttProviders',
    tts: 'audio:tts',
  },
} as const

export const LIVE_CHANNELS = {
  invoke: {
    begin: 'live:begin',
    translate: 'live:translate',
    assemble: 'live:assemble',
    cancel: 'live:cancel',
  },
} as const

export const CHAT_CHANNELS = {
  invoke: {
    send: 'chat:send',
    imageEdit: 'chat:image-edit',
    imageGenerate: 'chat:image-generate',
    stream: 'chat:stream',
    streamCancel: 'chat:stream:cancel',
  },
  event: {
    /** One channel carries every stream; events are tagged with their requestId. */
    streamEvent: 'chat:stream:event',
  },
} as const

export const IMAGE_TRANSLATE_CHANNELS = {
  invoke: {
    translate: 'image:translate',
    cancel: 'image:translate:cancel',
  },
  event: {
    modelSwitched: 'image:model-switched',
  },
} as const

export const TRANSLATE_CHANNELS = {
  invoke: {
    translate: 'translate',
    cancel: 'translate:cancel',
    verify: 'translate:verify',
    rewrite: 'translate:rewrite',
    detectLang: 'translate:detect-lang',
    /** Streams tokens to the subtitle window; registered in electron/ipc/subtitle.ts. */
    liveStream: 'translate:live-stream',
  },
} as const

export const MODELS_CHANNELS = {
  invoke: {
    fetch: 'models:fetch',
  },
} as const

export const LOCAL_AI_CHANNELS = {
  invoke: {
    discover: 'local-ai:discover',
    ensureRuntime: 'local-ai:ensureRuntime',
    benchmark: 'local-ai:benchmark',
    performanceGet: 'local-ai:performance:get',
    performanceCompare: 'local-ai:performance:compare',
    performanceSelect: 'local-ai:performance:select',
    performanceCancel: 'local-ai:performance:cancel',
    downloadModel: 'local-ai:downloadModel',
    uninstallModel: 'local-ai:uninstallModel',
    getActiveDownloads: 'local-ai:getActiveDownloads',
    installOllama: 'local-ai:installOllama',
    cancelModelDownload: 'local-ai:cancelModelDownload',
  },
  event: {
    modelDownloadProgress: 'local-ai:modelDownloadProgress',
  },
} as const

export const MODULES_CHANNELS = {
  invoke: {
    get: 'modules:get',
    setEnabled: 'modules:setEnabled',
  },
  event: {
    changed: 'modules:changed',
  },
} as const

export const CAPABILITY_CHANNELS = {
  invoke: {
    get: 'capabilities:get',
    request: 'capabilities:request',
  },
} as const

export const THERMAL_CHANNELS = {
  invoke: {
    getSupport: 'thermal:getSupport',
    read: 'thermal:read',
    setMonitoring: 'thermal:setMonitoring',
    getSettings: 'thermal:getSettings',
    updateSettings: 'thermal:updateSettings',
    fanGetState: 'thermal:fan:getState',
    fanEnable: 'thermal:fan:enable',
    fanSet: 'thermal:fan:set',
    fanRestoreAll: 'thermal:fan:restoreAll',
    fanDisable: 'thermal:fan:disable',
    fanProfilesGet: 'thermal:fan:profiles:get',
    fanProfilesApply: 'thermal:fan:profiles:apply',
    fanProfilesSave: 'thermal:fan:profiles:save',
    fanProfilesRemove: 'thermal:fan:profiles:remove',
    fanCalibrationGet: 'thermal:fan:calibration:get',
    fanCalibrationStart: 'thermal:fan:calibration:start',
    fanCalibrationCancel: 'thermal:fan:calibration:cancel',
    fanCalibrationClear: 'thermal:fan:calibration:clear',
  },
  event: {
    snapshot: 'thermal:snapshot',
    error: 'thermal:error',
    settingsChanged: 'thermal:settingsChanged',
    fanState: 'thermal:fan:state',
    fanProfilesState: 'thermal:fan:profiles:state',
    fanCalibrationState: 'thermal:fan:calibration:state',
  },
} as const
