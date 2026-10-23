/**
 * System preload API — OS permissions, external URLs, login item, window chrome and
 * app metadata. Shape: `shared/systemApi.d.ts`; channels: `electron/ipc/channels.ts`.
 */
import type { SystemApi } from '../../shared/systemApi'
import { SYSTEM_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

const ch = SYSTEM_CHANNELS.invoke

export const systemApi: SystemApi = {
  checkScreenPermission: invoke(ch.checkScreenPermission),
  openExternal: invoke(ch.openExternal),
  relaunchApp: invoke(ch.relaunch),
  getLoginItemSettings: invoke(ch.getLoginItemSettings),
  setLoginItemSettings: invoke(ch.setLoginItemSettings),
  setWindowTheme: invoke(ch.setWindowTheme),
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
}

/** These members sit directly on `window.api`, so the section is the API object itself. */
export const systemSection = systemApi
