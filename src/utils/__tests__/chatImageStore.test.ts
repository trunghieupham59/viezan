import { describe, expect, it } from 'vitest'
import {
  chatImageStoreKey,
  clearAllChatImages,
  getChatImage,
  getChatImageStoreStats,
  pruneUnusedChatImages,
  putChatImage,
} from '../chatImageStore'

describe('chatImageStore', () => {
  it('builds a stable key from session, message and image index', () => {
    expect(chatImageStoreKey('chat-1', 'msg-9')).toBe('chat-1:msg-9:0')
    expect(chatImageStoreKey('chat-1', 'msg-9', 2)).toBe('chat-1:msg-9:2')
  })

  // jsdom has no IndexedDB: every call must degrade to a no-op instead of throwing,
  // so chat keeps working (just without restored images) where storage is unavailable.
  it('degrades gracefully when IndexedDB is unavailable', async () => {
    expect(typeof indexedDB).toBe('undefined')
    await expect(putChatImage('k', { imageBase64: 'AAAA', imageMimeType: 'image/png' })).resolves.toBe(false)
    await expect(getChatImage('k')).resolves.toBeNull()
    await expect(getChatImageStoreStats()).resolves.toEqual({ count: 0, bytes: 0 })
    await expect(pruneUnusedChatImages(new Set(['k']))).resolves.toBe(0)
    await expect(clearAllChatImages()).resolves.toBeUndefined()
  })
})
