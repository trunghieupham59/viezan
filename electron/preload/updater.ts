/**
 * Auto-updater preload API — check, download and install app updates.
 * Shape: `shared/updaterApi.d.ts`.
 */
import type { UpdaterApi } from '../../shared/updaterApi'
import { UPDATER_CHANNELS } from '../ipc/channels'
import { invoke, subscribe, subscribeSignal } from './contract'

const { invoke: ch, event } = UPDATER_CHANNELS

export const updaterApi: UpdaterApi = {
  consumeOpenSettings: invoke(ch.consumeOpenSettings),
  getNotificationPreferences: invoke(ch.notificationPreferences),
  setNotificationPreferences: invoke(ch.setNotificationPreferences),
  onOpenSettings: subscribeSignal(event.openSettings),
  getStatus: invoke(ch.getStatus),
  check: invoke(ch.check),
  download: invoke(ch.download),
  install: invoke(ch.install),
  openInstaller: invoke(ch.openInstaller),
  getVersion: invoke(ch.getVersion),
  openDownload: invoke(ch.openDownload),
  onStatus: subscribe(event.status),
}

export const updaterSection = { updater: updaterApi }
