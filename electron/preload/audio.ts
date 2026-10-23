/**
 * Audio preload API — live interpretation, speech-to-text and text-to-speech.
 *
 * STT routing is purpose-aware in the main process (dictation vs live) and the
 * provider priority is configured in Settings → Speech-to-Text. Recorded audio always
 * crosses this typed boundary and is processed in main. Shape: `shared/audioApi.d.ts`.
 */
import type { AudioApi } from '../../shared/audioApi'
import { AUDIO_CHANNELS, LIVE_CHANNELS } from '../ipc/channels'
import { invoke } from './contract'

export const audioApi: AudioApi = {
  liveInterpretation: {
    begin: invoke(LIVE_CHANNELS.invoke.begin),
    translate: invoke(LIVE_CHANNELS.invoke.translate),
    assemble: invoke(LIVE_CHANNELS.invoke.assemble),
    cancel: invoke(LIVE_CHANNELS.invoke.cancel),
  },
  transcribeAudio: invoke(AUDIO_CHANNELS.invoke.transcribe),
  cancelAudioTranscription: invoke(AUDIO_CHANNELS.invoke.cancelTranscription),
  checkSttProviders: invoke(AUDIO_CHANNELS.invoke.checkSttProviders),
  speakText: invoke(AUDIO_CHANNELS.invoke.tts),
}

/** These members sit directly on `window.api`. */
export const audioSection = audioApi
