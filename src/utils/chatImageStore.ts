/**
 * Durable storage for the images in a chat: the ones the AI produced (generated
 * or edited) and the ones the user attached.
 *
 * The chat store strips every image's pixel data before persisting a session,
 * because multi-megabyte base64 strings overflow localStorage's quota. Without
 * this store an old conversation would show its captions and no pictures.
 *
 * IndexedDB has no such quota problem, so the pixels live here, keyed by
 * `imageStoreKey` (a small string the persisted message keeps). Every function
 * is best-effort and never throws: when IndexedDB is unavailable (tests, private
 * windows) the chat simply behaves as before.
 *
 * Nothing here is removed automatically: images stay for as long as the
 * conversation that references them. Cleanup is an explicit user action in
 * Settings (`pruneUnusedChatImages`, `clearAllChatImages`).
 */

import type { ChatSession } from '../types'

const DB_NAME = 'viezan-chat-images'
const STORE_NAME = 'images'
const DB_VERSION = 1

export interface StoredChatImage {
  imageBase64: string
  imageMimeType: string
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Run one request inside a transaction; resolves with its result or `fallback` on any failure. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest | null,
  fallback: T,
): Promise<T> {
  const db = await openDb()
  if (!db) return fallback
  return new Promise<T>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = run(transaction.objectStore(STORE_NAME))
      let result: unknown = fallback
      if (request) request.onsuccess = () => { result = request.result ?? fallback }
      transaction.oncomplete = () => { db.close(); resolve(result as T) }
      transaction.onerror = () => { db.close(); resolve(fallback) }
      transaction.onabort = () => { db.close(); resolve(fallback) }
    } catch {
      db.close()
      resolve(fallback)
    }
  })
}

/** Build the key under which a message's image is stored. */
export function chatImageStoreKey(sessionId: string, messageId: string, index = 0): string {
  return `${sessionId}:${messageId}:${index}`
}

export function putChatImage(key: string, image: StoredChatImage): Promise<boolean> {
  return withStore('readwrite', (store) => store.put(image, key), null).then((result) => result !== null)
}

export function getChatImage(key: string): Promise<StoredChatImage | null> {
  return withStore<StoredChatImage | null>('readonly', (store) => store.get(key), null)
}

export interface ChatImageStoreStats {
  /** Number of stored images. */
  count: number
  /** Approximate size of their pixel data in bytes (base64 length). */
  bytes: number
}

/** Count the stored images and sum their size, so Settings can show what a cleanup would reclaim. */
export async function getChatImageStoreStats(): Promise<ChatImageStoreStats> {
  const empty: ChatImageStoreStats = { count: 0, bytes: 0 }
  const db = await openDb()
  if (!db) return empty
  return new Promise<ChatImageStoreStats>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const stats: ChatImageStoreStats = { count: 0, bytes: 0 }
      const request = transaction.objectStore(STORE_NAME).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const value = cursor.value as Partial<StoredChatImage> | undefined
        stats.count += 1
        stats.bytes += typeof value?.imageBase64 === 'string' ? value.imageBase64.length : 0
        cursor.continue()
      }
      transaction.oncomplete = () => { db.close(); resolve(stats) }
      transaction.onerror = () => { db.close(); resolve(empty) }
      transaction.onabort = () => { db.close(); resolve(empty) }
    } catch {
      db.close()
      resolve(empty)
    }
  })
}

/**
 * Delete stored images that no conversation references any more (for example the
 * conversation was deleted). `referencedKeys` is every `imageStoreKey` still in use.
 * Returns how many images were removed.
 */
export async function pruneUnusedChatImages(referencedKeys: ReadonlySet<string>): Promise<number> {
  const db = await openDb()
  if (!db) return 0
  return new Promise<number>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      let removed = 0
      const request = transaction.objectStore(STORE_NAME).openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (!referencedKeys.has(String(cursor.key))) {
          cursor.delete()
          removed += 1
        }
        cursor.continue()
      }
      transaction.oncomplete = () => { db.close(); resolve(removed) }
      transaction.onerror = () => { db.close(); resolve(0) }
      transaction.onabort = () => { db.close(); resolve(0) }
    } catch {
      db.close()
      resolve(0)
    }
  })
}

/** Delete every stored image. Conversations keep their captions but lose the pictures. */
export async function clearAllChatImages(): Promise<void> {
  await withStore('readwrite', (store) => store.clear(), null)
}

/** Every `imageStoreKey` that a conversation still references. */
export function collectReferencedImageKeys(sessions: ReadonlyArray<Pick<ChatSession, 'messages'>>): Set<string> {
  const keys = new Set<string>()
  for (const session of sessions) {
    for (const message of session.messages) {
      for (const part of message.content) {
        if (part.imageStoreKey) keys.add(part.imageStoreKey)
      }
    }
  }
  return keys
}
