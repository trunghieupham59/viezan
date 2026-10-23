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

export const CAPABILITY_CHANNELS = {
  invoke: {
    get: 'capabilities:get',
    request: 'capabilities:request',
  },
} as const
