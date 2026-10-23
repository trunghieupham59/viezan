/**
 * Subtitle overlay preload API — floating subtitle window shown above all OS windows.
 * Shape: `shared/subtitleApi.d.ts`.
 */
import type { SubtitleApi, SubtitleStyle } from '../../shared/subtitleApi'
import { SUBTITLE_CHANNELS } from '../ipc/channels'
import { invoke, subscribe, subscribeSignal } from './contract'

const { invoke: ch, event } = SUBTITLE_CHANNELS

const updateText = invoke<[{ text: string; isTranslating: boolean }], void>(ch.update)
const setSourceText = invoke<[{ text: string; segId?: string }], void>(ch.setSourceText)

export const subtitleApi: SubtitleApi = {
  show: invoke(ch.show),
  hide: invoke(ch.hide),
  // Main expects one params object for these two; the renderer-facing shape stays positional.
  update: (text, isTranslating) => updateText({ text, isTranslating }),
  setStyle: invoke(ch.setStyle),
  setSourceText: (text, segId) => setSourceText({ text, segId }),
  pushState: invoke(ch.setState),
  onClosed: subscribeSignal(event.closed),
  onStart: subscribeSignal(event.actionStart),
  onStop: subscribeSignal(event.actionStop),
  onSetProvider: subscribe<string>(event.actionSetProvider),
  onSetModel: subscribe<string>(event.actionSetModel),
  onSetAudioMode: subscribe<string>(event.actionSetAudioMode),
  onSetTargetLang: subscribe<string>(event.actionSetTargetLang),
  onStyleUpdate: subscribe<SubtitleStyle>(event.actionUpdateStyle),
  onClear: subscribeSignal(event.actionClear),
}

export const subtitleSection = { subtitle: subtitleApi }
