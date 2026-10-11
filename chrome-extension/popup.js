const $ = (id) => document.getElementById(id)
const Bridge = window.ViezanLocalBridge
const ExtensionOptions = window.ViezanExtensionOptions || Bridge

ExtensionOptions.populateDocumentSelects()

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
const COPY_LABEL = 'Copy'
const REPLACE_LABEL = 'Replace'
const COPY_TITLE = isMac ? 'Copy translation (Cmd+C)' : 'Copy translation (Ctrl+C)'
const REPLACE_TITLE = isMac ? 'Replace selected text (Cmd+Enter)' : 'Replace selected text (Ctrl+Enter)'
const LISTEN_LABEL = 'Listen'
const POPUP_COPY = {
  translationControls: 'Translation controls',
  sourcePlaceholder: 'Paste or type text here...',
  resultPlaceholder: 'Translation appears here...',
}

// Last translated text — used by Copy and Replace buttons
let lastTranslated = ''
const ttsPlayer = Bridge.createTtsController({
  getButton: () => $('btn-speak-result'),
  listenLabel: LISTEN_LABEL,
  onError: (err) => {
    const msg = err?.message || 'TTS failed'
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      showStatus('Invalid API key. Update it in Options.', 'error')
    } else if (Bridge.isNetworkError(msg)) {
      showStatus('Cannot reach Viezan app. Is it running?', 'error')
    } else {
      showStatus(msg, 'error')
    }
  },
})

async function getSettings () {
  return new Promise((resolve) => {
    chrome.storage.local.get(['treToken', 'treTargetLang', 'treTranslationStyle'], (data) => {
      resolve({
        token: data.treToken || '',
        targetLang: data.treTargetLang || 'en',
        translationStyle: data.treTranslationStyle || 'general',
      })
    })
  })
}

function showStatus (msg, type) {
  const el = $('status-msg')
  el.textContent = msg
  el.className = `statusbar ${type}`
  el.style.display = 'block'
  if (type !== 'loading') {
    setTimeout(() => { el.style.display = 'none' }, 4000)
  }
}

function hideStatus () {
  $('status-msg').style.display = 'none'
}

function renderResultPlaceholder () {
  const resultEl = $('result-text')
  resultEl.textContent = ''
  const placeholder = document.createElement('span')
  placeholder.className = 'result-placeholder'
  placeholder.textContent = POPUP_COPY.resultPlaceholder
  resultEl.appendChild(placeholder)
}

function applyStaticCopy () {
  $('popup-controls')?.setAttribute('aria-label', POPUP_COPY.translationControls)
  $('input-text').placeholder = POPUP_COPY.sourcePlaceholder
  renderResultPlaceholder()
}

function setProviderBadge (el, provider) {
  const meta = window.ViezanProviderMeta?.getProviderMeta(provider)
  const displayName = (window.ViezanModelDisplay
    ? window.ViezanModelDisplay.getProviderDisplayName(provider)
    : provider) || '-'

  el.textContent = ''
  el.className = 'meta-badge ctrl-badge-provider'
  el.style.background = meta?.bg || ''
  el.style.borderColor = meta?.border || ''
  el.style.color = meta?.color || ''

  if (meta) {
    const mark = document.createElement('span')
    mark.className = 'provider-mark'
    mark.style.background = meta.color
    el.append(mark, document.createTextNode(displayName))
    return
  }

  el.textContent = displayName
}

/** Update header status badge + controls bar provider/model badges */
async function loadAppInfo (token) {
  const dot   = $('status-dot')
  const label = $('status-label')
  const providerEl = $('ctrl-provider')
  const modelEl    = $('ctrl-model')

  // Loading state
  dot.className = 'status-dot loading'
  label.textContent = 'Connecting...'

  try {
    const data = await Bridge.getAppConfig(token)

    // Header: active status
    dot.className = 'status-dot'
    label.textContent = 'Active'

    // Controls bar: provider badge
    setProviderBadge(providerEl, data.provider)

    // Controls bar: model badge — use the same short pretty name shown in
    // the desktop app's footer (e.g. "GPT 5.5 Mini" instead of
    // "gpt-5.5-mini-2026-05-01").
    modelEl.className = 'meta-badge ctrl-badge-model'
    modelEl.textContent = window.ViezanModelDisplay
      ? window.ViezanModelDisplay.formatModelName(data.provider, data.model) || '-'
      : (data.model || '-')
    modelEl.removeAttribute('style')
  } catch {
    dot.className = 'status-dot error'
    label.textContent = 'App not running'
    providerEl.className = 'meta-badge ctrl-badge-loading'
    providerEl.textContent = 'Provider unavailable'
    modelEl.className = 'meta-badge ctrl-badge-model ctrl-badge-loading'
    modelEl.textContent = 'Model unavailable'
  }
}

/** Show translation result and reveal Copy/Replace buttons */
function showResult (text) {
  ttsPlayer.stop()
  lastTranslated = text
  const resultEl = $('result-text')
  resultEl.innerHTML = ''
  resultEl.textContent = text

  // Reveal Copy + Replace buttons
  $('footer-result').style.display = 'flex'

  // Update button labels with OS-aware shortcuts
  $('btn-copy-result').textContent = COPY_LABEL
  $('btn-replace').textContent = REPLACE_LABEL
  $('btn-copy-result').title = COPY_TITLE
  $('btn-replace').title = REPLACE_TITLE
}

/** Hide Copy/Replace and reset result panel */
function clearResult () {
  ttsPlayer.stop()
  lastTranslated = ''
  renderResultPlaceholder()
  $('footer-result').style.display = 'none'
}

async function init () {
  applyStaticCopy()
  const settings = await getSettings()
  const hasToken = !!settings.token

  $('not-connected-state').style.display = hasToken ? 'none' : 'flex'
  $('connected-state').style.display     = hasToken ? 'flex' : 'none'

  if (hasToken) {
    // Load provider/model info (non-blocking)
    loadAppInfo(settings.token)

    // Restore saved target language
    const langSelect = $('target-lang')
    if (settings.targetLang) langSelect.value = settings.targetLang
    langSelect.addEventListener('change', () => {
      chrome.storage.local.set({ treTargetLang: langSelect.value })
    })

    // Restore saved translation style
    const styleSelect = $('translation-style')
    if (settings.translationStyle) styleSelect.value = settings.translationStyle
    styleSelect.addEventListener('change', () => {
      chrome.storage.local.set({ treTranslationStyle: styleSelect.value })
    })

    // Try to pre-fill with current tab selection
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString().trim() || '',
        }).catch(() => [{ result: '' }])
        if (result?.result) {
          $('input-text').value = result.result
        }
      }
    } catch { /* ignore — scripting may not be permitted */ }
  }
}

// ── Translate button ────────────────────────────────────────────────────────

$('btn-translate').addEventListener('click', async () => {
  const text = $('input-text').value.trim()
  if (!text) return

  const settings = await getSettings()
  const targetLang = $('target-lang').value

  $('btn-translate').disabled = true
  clearResult()
  showStatus('Translating...', 'loading')

  try {
    const translatedText = await Bridge.translateText({
      text,
      token: settings.token,
      targetLang,
      translationStyle: $('translation-style').value || 'general',
    })

    showResult(translatedText)
    hideStatus()
  } catch (err) {
    const msg = err.message || 'Unknown error'
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      showStatus('Invalid API key. Update it in Options.', 'error')
    } else if (Bridge.isNetworkError(msg)) {
      showStatus('Cannot reach Viezan app. Is it running?', 'error')
    } else {
      showStatus(msg, 'error')
    }
  } finally {
    $('btn-translate').disabled = false
  }
})

// ── Copy button ─────────────────────────────────────────────────────────────

$('btn-copy-result').addEventListener('click', async () => {
  if (!lastTranslated) return
  try {
    await navigator.clipboard.writeText(lastTranslated)
    $('btn-copy-result').textContent = 'Copied'
    setTimeout(() => {
      $('btn-copy-result').textContent = COPY_LABEL
    }, 1500)
  } catch {
    showStatus('Failed to copy', 'error')
  }
})

// ── Listen button ──────────────────────────────────────────────────────────

$('btn-speak-result').addEventListener('click', async () => {
  try {
    const settings = await getSettings()
    if (!settings.token) throw new Error('Missing API key')
    const lang = $('target-lang').value || settings.targetLang
    await ttsPlayer.play(lastTranslated, lang, settings.token)
  } catch (err) {
    const msg = err.message || 'TTS failed'
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      showStatus('Invalid API key. Update it in Options.', 'error')
    } else if (Bridge.isNetworkError(msg)) {
      showStatus('Cannot reach Viezan app. Is it running?', 'error')
    } else {
      showStatus(msg, 'error')
    }
  }
})

// ── Replace button ──────────────────────────────────────────────────────────

$('btn-replace').addEventListener('click', async () => {
  if (!lastTranslated) return
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      showStatus('No active tab found', 'error')
      return
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        const focused = document.activeElement
        const tag = focused?.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea') {
          const start = focused.selectionStart
          const end = focused.selectionEnd
          if (start !== end) {
            const before = focused.value.substring(0, start)
            const after  = focused.value.substring(end)
            focused.value = before + text + after
            focused.selectionStart = focused.selectionEnd = start + text.length
            focused.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          }
        }
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          const node = document.createTextNode(text)
          range.insertNode(node)
          range.setStartAfter(node)
          range.setEndAfter(node)
          sel.removeAllRanges()
          sel.addRange(range)
          return true
        }
        return false
      },
      args: [lastTranslated],
    })

    if (result?.result) {
      $('btn-replace').textContent = 'Replaced'
      setTimeout(() => {
        $('btn-replace').textContent = REPLACE_LABEL
      }, 1500)
    } else {
      showStatus('No text selected on page', 'error')
    }
  } catch {
    showStatus('Cannot replace. Try selecting text first.', 'error')
  }
})

// ── Clear button ────────────────────────────────────────────────────────────

$('btn-clear').addEventListener('click', () => {
  $('input-text').value = ''
  clearResult()
  hideStatus()
})

// ── Options buttons ─────────────────────────────────────────────────────────

$('btn-options').addEventListener('click',    () => chrome.runtime.openOptionsPage())
$('btn-go-options').addEventListener('click', () => chrome.runtime.openOptionsPage())

// ── Keyboard shortcuts ──────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey

  // Cmd/Ctrl+Enter → Translate
  if (mod && e.key === 'Enter') {
    e.preventDefault()
    $('btn-translate').click()
  }

  // Cmd/Ctrl+C → Copy (only when result buttons are visible and textarea not focused)
  if (mod && e.key === 'c' && lastTranslated &&
      $('footer-result').style.display !== 'none' &&
      document.activeElement !== $('input-text')) {
    e.preventDefault()
    $('btn-copy-result').click()
  }
})

// ── Init ────────────────────────────────────────────────────────────────────

init()
