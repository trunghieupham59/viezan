/**
 * Shared local Viezan bridge helpers for extension surfaces.
 *
 * Loaded as a plain script in popup/options/content contexts and via
 * importScripts() in the service worker. Keep this file DOM-optional.
 */
;(function attachToGlobal (root) {
  const PORT = 39875
  const BASE_URL = `http://127.0.0.1:${PORT}`

  const TTS_LANG_TO_BCP47 = Object.freeze({
    en: 'en-US',
    vi: 'vi-VN',
    ja: 'ja-JP',
    zh: 'zh-CN',
    'zh-TW': 'zh-TW',
    ko: 'ko-KR',
    fr: 'fr-FR',
    de: 'de-DE',
    es: 'es-ES',
    pt: 'pt-PT',
    th: 'th-TH',
    ru: 'ru-RU',
    ar: 'ar-SA',
    id: 'id-ID',
    it: 'it-IT',
    nl: 'nl-NL',
    tr: 'tr-TR',
    hi: 'hi-IN',
  })

  const TARGET_LANGUAGES = Object.freeze([
    ['en', 'English'],
    ['vi', 'Vietnamese'],
    ['ja', 'Japanese'],
    ['zh', 'Chinese'],
    ['zh-TW', 'Chinese (Traditional)'],
    ['ko', 'Korean'],
    ['fr', 'French'],
    ['de', 'German'],
    ['es', 'Spanish'],
    ['pt', 'Portuguese'],
    ['ru', 'Russian'],
    ['ar', 'Arabic'],
    ['th', 'Thai'],
    ['id', 'Indonesian'],
    ['it', 'Italian'],
    ['nl', 'Dutch'],
    ['tr', 'Turkish'],
    ['hi', 'Hindi'],
  ])

  const TRANSLATION_STYLES = Object.freeze([
    ['general', 'General'],
    ['formal', 'Formal'],
    ['casual', 'Casual'],
    ['business', 'Business'],
    ['technical', 'Technical'],
    ['natural', 'Natural'],
  ])

  function populateSelect (select, options, labelOverrides = {}) {
    if (!select) return
    const previousValue = select.value
    select.textContent = ''
    for (const [value, label] of options) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = labelOverrides[value] || label
      select.appendChild(option)
    }
    if (previousValue && options.some(([value]) => value === previousValue)) {
      select.value = previousValue
    }
  }

  function populateTargetLanguageSelect (select, labelOverrides) {
    populateSelect(select, TARGET_LANGUAGES, labelOverrides)
  }

  function populateTranslationStyleSelect (select) {
    populateSelect(select, TRANSLATION_STYLES)
  }

  function populateDocumentSelects (doc = document, options = {}) {
    populateTargetLanguageSelect(doc.getElementById('target-lang'), options.targetLabelOverrides)
    populateTranslationStyleSelect(doc.getElementById('translation-style'))
  }

  function authHeaders (token) {
    return { 'X-Viezan-Token': token }
  }

  // True only for real transport failures (app not running / port closed).
  // Browsers surface these as TypeError: "Failed to fetch" (Chromium),
  // "NetworkError when attempting to fetch resource" (Firefox) or
  // "Load failed" (Safari). Server-reported errors must not match.
  function isNetworkError (err) {
    const msg = typeof err === 'string' ? err : err?.message || ''
    return /failed to fetch|networkerror|load failed/i.test(msg)
  }

  async function readJsonResponse (resp, fallbackError) {
    const data = await resp.json().catch(() => null)
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
    if (!data?.success) throw new Error(data?.error || fallbackError)
    return data
  }

  async function getStatus (token) {
    const resp = await fetch(`${BASE_URL}/api/status`, {
      headers: authHeaders(token),
    })
    return readJsonResponse(resp, 'Unexpected response from Viezan app.')
  }

  async function getAppConfig (token) {
    const resp = await fetch(`${BASE_URL}/api/config`, {
      headers: authHeaders(token),
    })
    const data = await readJsonResponse(resp, 'Could not fetch app config')
    return { provider: data.provider, model: data.model }
  }

  async function translateText ({ text, token, targetLang, translationStyle, provider, model }) {
    const config = provider && model ? { provider, model } : await getAppConfig(token)
    const resp = await fetch(`${BASE_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify({
        text,
        targetLang,
        provider: config.provider,
        model: config.model,
        translationStyle: translationStyle || 'general',
      }),
    })
    const data = await readJsonResponse(resp, 'Translation failed')
    return data.translatedText
  }

  async function fetchTtsAudio (text, lang, token) {
    const resp = await fetch(`${BASE_URL}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify({ text, lang }),
    })
    const data = await readJsonResponse(resp, 'TTS failed')
    if (!data.audioBase64) throw new Error(data.error || 'TTS failed')
    return data
  }

  function base64ToBlobUrl (base64, mimeType) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: mimeType || 'audio/mpeg' })
    return URL.createObjectURL(blob)
  }

  function speakWithBrowserSpeech (text, lang, onDone) {
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return false
    const bcp47 = TTS_LANG_TO_BCP47[lang] || 'en-US'
    const utter = new root.SpeechSynthesisUtterance(text)
    utter.lang = bcp47
    const voices = root.speechSynthesis.getVoices()
    const prefix = bcp47.split('-')[0]
    const local = voices.filter((voice) => voice.localService)
    utter.voice =
      local.find((voice) => voice.lang === bcp47) ||
      voices.find((voice) => voice.lang === bcp47) ||
      local.find((voice) => voice.lang.startsWith(prefix)) ||
      voices.find((voice) => voice.lang.startsWith(prefix)) ||
      null
    utter.onend = onDone
    utter.onerror = onDone
    root.speechSynthesis.cancel()
    root.speechSynthesis.speak(utter)
    return true
  }

  function createTtsController ({
    getButton,
    listenLabel = 'Listen',
    stopLabel = 'Stop',
    loadingLabel = 'Loading...',
    onError,
    fetchAudio = fetchTtsAudio,
  }) {
    let audio = null
    let audioUrl = ''
    let loading = false
    let requestId = 0
    let usingSpeech = false

    const button = () => typeof getButton === 'function' ? getButton() : getButton
    const setButton = (label) => {
      const btn = button()
      if (btn) btn.textContent = label
    }

    function stop () {
      requestId++
      if (audio) {
        try { audio.pause() } catch { /* ignore */ }
        audio = null
      }
      if (usingSpeech && root.speechSynthesis) {
        usingSpeech = false
        root.speechSynthesis.cancel()
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
        audioUrl = ''
      }
      loading = false
      const btn = button()
      if (btn) {
        btn.textContent = listenLabel
        btn.disabled = false
      }
    }

    function fallbackToBrowserSpeech (text, lang) {
      const didStart = speakWithBrowserSpeech(text, lang, stop)
      if (didStart) {
        usingSpeech = true
        setButton(stopLabel)
      }
      return didStart
    }

    async function play (text, lang, token) {
      if (!text || loading) {
        if (loading) stop()
        return
      }
      if (audio) {
        stop()
        return
      }

      try {
        loading = true
        const id = ++requestId
        setButton(loadingLabel)
        const result = await fetchAudio(text, lang, token)
        if (id !== requestId) return
        audioUrl = base64ToBlobUrl(result.audioBase64, result.mimeType)
        audio = new Audio(audioUrl)
        audio.onended = stop
        audio.onerror = () => {
          stop()
          onError?.(new Error('Failed to play audio'))
        }
        loading = false
        setButton(stopLabel)
        await audio.play().catch((err) => {
          stop()
          if (fallbackToBrowserSpeech(text, lang)) return
          throw err
        })
      } catch (err) {
        stop()
        if (fallbackToBrowserSpeech(text, lang)) return
        onError?.(err)
      }
    }

    return {
      play,
      stop,
      isLoading: () => loading,
      hasAudio: () => Boolean(audio),
    }
  }

  root.ViezanLocalBridge = {
    PORT,
    BASE_URL,
    isNetworkError,
    getStatus,
    getAppConfig,
    translateText,
    fetchTtsAudio,
    base64ToBlobUrl,
    createTtsController,
    TARGET_LANGUAGES,
    TRANSLATION_STYLES,
    populateSelect,
    populateTargetLanguageSelect,
    populateTranslationStyleSelect,
    populateDocumentSelects,
  }
})(typeof globalThis !== 'undefined' ? globalThis : window)
