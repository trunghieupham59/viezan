/**
 * Chat & image-translate preload API — multi-turn AI chat and image OCR + translation.
 * Shape: `shared/chatApi.d.ts`.
 */
import type { ChatApi, ChatStreamEvent } from '../../shared/chatApi'
import { CHAT_CHANNELS, IMAGE_TRANSLATE_CHANNELS } from '../ipc/channels'
import { invoke, subscribe } from './contract'

const onAnyChatStreamEvent = subscribe<ChatStreamEvent>(CHAT_CHANNELS.event.streamEvent)

export const chatApi: ChatApi = {
  translateImage: invoke(IMAGE_TRANSLATE_CHANNELS.invoke.translate),
  onImageModelSwitched: subscribe(IMAGE_TRANSLATE_CHANNELS.event.modelSwitched),
  chat: invoke(CHAT_CHANNELS.invoke.send),
  editChatImage: invoke(CHAT_CHANNELS.invoke.imageEdit),
  generateChatImage: invoke(CHAT_CHANNELS.invoke.imageGenerate),
  chatStream: invoke(CHAT_CHANNELS.invoke.stream),
  chatStreamCancel: invoke(CHAT_CHANNELS.invoke.streamCancel),
  // One main-side channel carries every stream; each subscriber sees only its own request.
  onChatStreamEvent: (requestId, cb) => onAnyChatStreamEvent((event) => {
    if (event?.requestId === requestId) cb(event)
  }),
}

/** These members sit directly on `window.api`. */
export const chatSection = chatApi
