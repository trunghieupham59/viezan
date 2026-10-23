/**
 * Local Server preload API — Chrome Extension bridge via the API-key authenticated HTTP
 * server. Shape: `shared/localServerApi.d.ts`.
 */
import type { LocalServerApi } from '../../shared/localServerApi'
import { LOCAL_SERVER_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

const ch = LOCAL_SERVER_CHANNELS.invoke

export const localServerApi: LocalServerApi = {
  createToken: invoke(ch.createToken),
  listTokens: invoke(ch.listTokens),
  deleteToken: invoke(ch.deleteToken),
  regenerateToken: invoke(ch.regenerateToken),
  syncConfig: invoke(ch.syncConfig),
}

export const localServerSection = { localServer: localServerApi }
