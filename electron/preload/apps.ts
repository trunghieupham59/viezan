import type { AppsApi } from '../../shared/appsApi'
import { APPS_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

const ch = APPS_CHANNELS.invoke
export const appsApi: AppsApi = {
  inventory: invoke(ch.inventory), inspect: invoke(ch.inspect), apply: invoke(ch.apply),
  sessions: invoke(ch.sessions), undo: invoke(ch.undo), reveal: invoke(ch.reveal),
}
export const appsSection = { apps: appsApi }
