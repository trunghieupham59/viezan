// Run in the developer console of the old Viezan app before uninstalling it.
// Reads application state only; never exports provider credentials or changes source storage.
(async () => {
  const encoded = localStorage.getItem('translate-app-settings')
  if (!encoded) throw new Error('Viezan persisted state was not found in this page')
  const original = JSON.parse(encoded).state
  if (!original || !Array.isArray(original.chatSessions)) throw new Error('Unsupported Viezan profile')
  const fields = ['chatSessions', 'history', 'dictionaryEntries', 'liveSessions', 'systemPromptPresets',
    'chatPendingDraft', 'activeChatSessionId', 'chatSystemPrompt', 'locale', 'sourceLang', 'targetLang',
    'autoTranslate', 'autoTranslateDelay', 'localAiEngine', 'translationReasoningEffort', 'selectedProvider', 'selectedModels', 'translationModels', 'translationStyle', 'theme', 'themePreset',
    'themeAccent', 'fontSize', 'sidebarCollapsed', 'aiChatSidebarCollapsed', 'sttProvider', 'ttsMode',
    'ttsVoice', 'pinnedLanguagePairs', 'recentLanguagePairs', 'languagePairDirections', 'costCurrency',
    'langUsage', 'apiKeyUsageTotals', 'recentModels']
  const state = Object.fromEntries(fields.filter(key => Object.hasOwn(original, key)).map(key => [key, original[key]]))
  const databases = await indexedDB.databases()
  async function read(name, store, key) {
    if (!databases.some(db => db.name === name)) return undefined
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('Cannot open migration source'))
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Source database changed during export')) }
    })
    try {
      if (!db.objectStoreNames.contains(store)) return undefined
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readonly'), request = transaction.objectStore(store).get(key)
        transaction.oncomplete = () => resolve(request.result)
        transaction.onabort = transaction.onerror = () => reject(new Error('Cannot read migration source'))
      })
    } finally { db.close() }
  }
  const recovery = await read('viezan-workbench', 'recovery', 'sessions') || {}
  const keys = new Set()
  for (const session of state.chatSessions) for (const message of session.messages || [])
    for (const part of Array.isArray(message.content) ? message.content : []) if (part.type === 'image' && part.imageStoreKey) keys.add(part.imageStoreKey)
  const images = {}, missingImages = []
  for (const key of keys) {
    const image = await read('viezan-chat-images', 'images', key)
    if (image) images[key] = image
    else missingImages.push(key)
  }
  const payload = JSON.stringify({ state, recovery, images, missingImages })
  if (new TextEncoder().encode(payload).byteLength > 128000000) throw new Error('Profile exceeds the single-file migration limit')
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))), b => b.toString(16).padStart(2, '0')).join('')
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'viezan-legacy-export', version: 1, payload, sha256 })], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'viezan-legacy-export.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return { conversations: state.chatSessions.length, missingImages: missingImages.length }
})()
