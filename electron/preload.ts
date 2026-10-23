/**
 * Electron Preload — context bridge between main process and renderer.
 *
 * Raw API keys NEVER leave the main process. The renderer only receives
 * typed response objects.
 *
 * Each domain is split into its own module under `./preload/` for maintainability.
 * This file is the single aggregation point — it merges all domain sections into
 * one `window.api` surface so the renderer API contract stays unchanged.
 */
import { contextBridge } from 'electron'
import { audioSection } from './preload/audio'
import { capabilitiesSection } from './preload/capabilities'
import { chatSection } from './preload/chat'
import { hotkeySection } from './preload/hotkey'
import { keychainSection } from './preload/keychain'
import { legacyAssistantSection } from './preload/legacyAssistant'
import { localServerSection } from './preload/localServer'
import { modulesSection } from './preload/modules'
import { quickChatSection } from './preload/quickChat'
import { subtitleSection } from './preload/subtitle'
import { systemSection } from './preload/system'
import { thermalSection } from './preload/thermal'
import { translateSection } from './preload/translate'
import { updaterSection } from './preload/updater'
import { webSearchSection } from './preload/webSearch'

contextBridge.exposeInMainWorld('api', {
  ...keychainSection,
  ...translateSection,
  ...audioSection,
  ...chatSection,
  ...subtitleSection,
  ...systemSection,
  ...capabilitiesSection,
  ...modulesSection,
  ...thermalSection,
  ...updaterSection,
  ...hotkeySection,
  ...quickChatSection,
  ...legacyAssistantSection,
  ...localServerSection,
  ...webSearchSection,
})
