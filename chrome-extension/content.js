/**
 * Viezan — Content Script
 *
 * Injects a small floating icon button whenever the user selects text.
 * Clicking the button calls the Viezan local API (localhost:39875) to translate
 * and shows the result in a tooltip above the selection.
 */

;(() => {
  // ── Extension context guard ────────────────────────────────────────────────
  // Content scripts access the real DOM through Chrome's proxy layer.
  // If the extension context is invalidated, even basic DOM operations throw.
  // Check synchronously BEFORE doing anything.
  try {
    if (!chrome.runtime?.id) return
  } catch {
    return
  }

  const Bridge = globalThis.ViezanLocalBridge
  if (!Bridge?.createTtsController) return

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // background.js re-injects this script after a failed PING, and the manifest
  // also injects it at document_idle, so two instances can race on one tab.
  // A live earlier instance wins; a dead one (invalidated context) is disposed
  // so its listeners and UI cannot linger next to ours.
  const previousInstance = globalThis.__viezanContent
  if (previousInstance) {
    let previousAlive = false
    try { previousAlive = previousInstance.isAlive() } catch { /* dead context */ }
    if (previousAlive) return
    try { previousInstance.dispose() } catch { /* ignore */ }
  }
  const listenerAbort = new AbortController()
  const listenerSignal = listenerAbort.signal

  function populateFallbackSelect (select, encodedOptions) {
    if (!select) return
    const previousValue = select.value
    select.textContent = ''
    for (const item of encodedOptions.split('|')) {
      const [value, label] = item.split(':')
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      select.appendChild(option)
    }
    if (previousValue && [...select.options].some((option) => option.value === previousValue)) {
      select.value = previousValue
    }
  }

  const Options = {
    populateTargetLanguageSelect:
      globalThis.ViezanExtensionOptions?.populateTargetLanguageSelect ||
      Bridge.populateTargetLanguageSelect ||
      ((select) => populateFallbackSelect(select, 'en:English|vi:Vietnamese|ja:Japanese|zh:Chinese|zh-TW:Chinese (Traditional)|ko:Korean|fr:French|de:German|es:Spanish|pt:Portuguese|ru:Russian|ar:Arabic|th:Thai|id:Indonesian|it:Italian|nl:Dutch|tr:Turkish|hi:Hindi')),
    populateTranslationStyleSelect:
      globalThis.ViezanExtensionOptions?.populateTranslationStyleSelect ||
      Bridge.populateTranslationStyleSelect ||
      ((select) => populateFallbackSelect(select, 'general:General|formal:Formal|casual:Casual|business:Business|technical:Technical|natural:Natural')),
  }
  const ICON_URL = chrome.runtime.getURL('icons/icon48.png')
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const COPY_LABEL = 'Copy'
  const REPLACE_LABEL = 'Replace'
  const COPY_TITLE = isMac ? 'Copy translation (Cmd+C)' : 'Copy translation (Ctrl+C)'
  const REPLACE_TITLE = isMac ? 'Replace selected text (Cmd+Enter)' : 'Replace selected text (Ctrl+Enter)'
  const LISTEN_LABEL = 'Listen'
  const CONTENT_COPY = {
    logoAlt: 'Viezan',
    close: 'Close',
    targetLanguage: 'Target language',
    translationStyle: 'Translation style',
  }

  // ── Cleanup stale UI from a previous content script instance ──────────────
  // When the extension is reloaded/updated, background.js re-injects this
  // script into open tabs. Remove any leftover elements from the old instance
  // so we don't end up with duplicate buttons or tooltips.
  document.getElementById('Viezan-btn')?.remove()
  document.getElementById('tre-result-tooltip')?.remove()

  // ── DOM setup ──────────────────────────────────────────────────────────────

  const root = document.body || document.documentElement

  // Build btn (avoid putting chrome-extension:// URL in innerHTML)
  const btn = document.createElement('button')
  btn.id = 'Viezan-btn'
  btn.title = 'Viezan Translate'
  const btnImg = document.createElement('img')
  btnImg.src = ICON_URL
  btnImg.alt = CONTENT_COPY.logoAlt
  btn.appendChild(btnImg)

  // Build tooltip (avoid putting chrome-extension:// URL in innerHTML)
  const tooltip = document.createElement('div')
  tooltip.id = 'tre-result-tooltip'
  tooltip.innerHTML = `
    <div class="tre-tooltip-header">
      <img class="tre-tooltip-logo" />
      <span class="tre-tooltip-label">VIEZAN</span>
      <span class="tre-status-badge">
        <span class="tre-status-dot tre-status-loading"></span>
        <span class="tre-status-text">Connecting...</span>
      </span>
      <div class="tre-header-spacer"></div>
      <button class="tre-close-btn">x</button>
    </div>
    <div class="tre-controls-row">
      <div class="tre-model-stack">
        <span class="tre-ctrl-item tre-ctrl-provider tre-ctrl-loading">Provider</span>
        <span class="tre-ctrl-item tre-ctrl-model tre-ctrl-loading">Model</span>
      </div>
      <div class="tre-select-field">
        <label>To</label>
        <select class="tre-lang-select"></select>
      </div>
      <div class="tre-select-field">
        <label>Style</label>
        <select class="tre-style-select"></select>
      </div>
    </div>
    <div class="tre-tooltip-body">
      <div class="tre-panel tre-source-panel">
        <div class="tre-panel-label">Original</div>
        <div class="tre-source-text"></div>
      </div>
      <div class="tre-panel-divider"></div>
      <div class="tre-panel tre-result-panel">
        <div class="tre-panel-label">Translation</div>
        <div class="tre-tooltip-text"></div>
      </div>
    </div>
    <div class="tre-tooltip-actions">
      <button class="tre-action-btn tre-listen-btn">Listen</button>
      <button class="tre-action-btn tre-copy-btn">Copy</button>
      <button class="tre-action-btn tre-replace-btn">Replace</button>
      <!-- labels updated dynamically after isMac detection -->
    </div>
  `
  // Set logo src separately after innerHTML is parsed (avoids chrome-extension:// in innerHTML)
  tooltip.querySelector('.tre-tooltip-logo').src = ICON_URL
  tooltip.querySelector('.tre-tooltip-logo').alt = CONTENT_COPY.logoAlt
  tooltip.querySelector('.tre-close-btn').title = CONTENT_COPY.close
  tooltip.querySelector('.tre-close-btn').setAttribute('aria-label', CONTENT_COPY.close)
  tooltip.querySelector('.tre-lang-select').title = CONTENT_COPY.targetLanguage
  tooltip.querySelector('.tre-style-select').title = CONTENT_COPY.translationStyle

  try {
    root.appendChild(btn)
    root.appendChild(tooltip)
  } catch {
    return // Failed to inject UI elements, bail out
  }

  const copyBtn = tooltip.querySelector('.tre-copy-btn')
  const replaceBtn = tooltip.querySelector('.tre-replace-btn')
  const listenBtn = tooltip.querySelector('.tre-listen-btn')
  const langSelect = tooltip.querySelector('.tre-lang-select')
  const styleSelect = tooltip.querySelector('.tre-style-select')
  const closeBtn = tooltip.querySelector('.tre-close-btn')
  Options.populateTargetLanguageSelect(langSelect)
  Options.populateTranslationStyleSelect(styleSelect)
  const ttsPlayer = Bridge.createTtsController({
    getButton: () => listenBtn,
    listenLabel: LISTEN_LABEL,
    fetchAudio: (text, lang, token) => requestBackground('VIEZAN_TTS', { text, lang, token }),
    onError: () => {
      listenBtn.textContent = 'Failed'
      setTimeout(() => { listenBtn.textContent = LISTEN_LABEL }, 1500)
    },
  })

  // Apply OS-aware shortcut labels to action buttons
  copyBtn.textContent = COPY_LABEL
  replaceBtn.textContent = REPLACE_LABEL
  copyBtn.title = COPY_TITLE
  replaceBtn.title = REPLACE_TITLE

  // Keep the page/editor selection alive while the user interacts with Viezan UI.
  // Rich markdown editors often collapse their internal cursor when a toolbar
  // button receives focus; replacement then lands at the editor's fallback caret.
  for (const el of [btn, copyBtn, replaceBtn, listenBtn]) {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    }, true)
  }

  // ── State ─────────────────────────────────────────────────────────────────

  let lastSelection = ''
  let lastSelectionRect = null   // saved rect for tooltip positioning
  let savedRange = null          // for DOM/contenteditable selections
  let savedInputEl = null        // for textarea/input selections
  let savedInputStart = 0        // textarea selectionStart
  let savedInputEnd = 0          // textarea selectionEnd
  let currentTranslation = ''
  let currentSource = ''         // text that produced currentTranslation
  let tooltipVisible = false     // explicit flag: inline display is '' before first show
  let requestSeq = 0             // monotonically increasing translate request id
  let pendingBtnId = 0           // request id of an in-flight button/shortcut translate

  // ── Helpers ───────────────────────────────────────────────────────────────

  function isContextValid () {
    try { return !!chrome.runtime?.id } catch { return false }
  }

  /** Map a failure to a user-facing sentence; only real network failures read as "app offline". */
  function describeError (err) {
    const msg = err?.message || 'Unknown error'
    if (/\b401\b|Unauthorized/i.test(msg)) {
      return 'API key is invalid. Please update it in the Options page.'
    }
    if (Bridge.isNetworkError(msg)) {
      return 'Cannot connect to Viezan app. Make sure the Viezan app is running.'
    }
    return msg
  }

  function retireInvalidContextUi () {
    try { hideButton() } catch { /* ignore */ }
    try { hideTooltip() } catch { /* ignore */ }
    try { btn.remove() } catch { /* ignore */ }
    try { tooltip.remove() } catch { /* ignore */ }
  }

  function getSettings () {
    return new Promise((resolve, reject) => {
      if (!isContextValid()) { reject(new Error('Extension context invalidated.')); return }
      try {
        chrome.storage.local.get(['treToken', 'treTargetLang', 'treTranslationStyle'], (data) => {
          resolve({
            token: data.treToken || '',
            targetLang: data.treTargetLang || 'en',
            translationStyle: data.treTranslationStyle || 'general',
          })
        })
      } catch {
        reject(new Error('Extension context invalidated.'))
      }
    })
  }

  function getProviderDisplayName (provider) {
    return (globalThis.ViezanModelDisplay
      ? globalThis.ViezanModelDisplay.getProviderDisplayName(provider)
      : provider) || '-'
  }

  function getModelDisplayName (provider, model) {
    return (globalThis.ViezanModelDisplay
      ? globalThis.ViezanModelDisplay.formatModelName(provider, model)
      : model) || '-'
  }

  function setProviderBadge (el, provider) {
    const meta = globalThis.ViezanProviderMeta?.getProviderMeta(provider, { bgAlpha: 0.08, borderAlpha: 0.2 })
    const name = getProviderDisplayName(provider)
    el.textContent = ''
    el.className = 'tre-ctrl-item tre-ctrl-provider'
    el.style.cssText = ''

    if (meta) {
      el.style.cssText = `background:${meta.bg};border-color:${meta.border};color:${meta.color}`
      const mark = document.createElement('span')
      mark.className = 'provider-mark'
      mark.style.background = meta.color
      el.append(mark, document.createTextNode(name))
      return
    }

    el.textContent = name
  }

  function requestBackground (type, payload) {
    return new Promise((resolve, reject) => {
      if (!isContextValid()) {
        reject(new Error('Extension context invalidated.'))
        return
      }
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          if (!response?.success) {
            reject(new Error(response?.error || 'Viezan request failed'))
            return
          }
          resolve(response)
        })
      } catch {
        reject(new Error('Extension context invalidated.'))
      }
    })
  }

  /** Populate the provider/model badges and status in the controls row */
  async function updateAiInfo (token) {
    const providerEl  = tooltip.querySelector('.tre-ctrl-provider')
    const modelEl     = tooltip.querySelector('.tre-ctrl-model')
    const statusDot   = tooltip.querySelector('.tre-status-dot')
    const statusText  = tooltip.querySelector('.tre-status-text')
    if (!providerEl || !modelEl) return
    try {
      const config = await requestBackground('VIEZAN_GET_CONFIG', { token })

      // Update status to Active.
      if (statusDot)  { statusDot.className = 'tre-status-dot tre-status-active' }
      if (statusText) { statusText.textContent = 'Active' }

      // Provider badge
      setProviderBadge(providerEl, config.provider)

      // Model badge — use the desktop app's short pretty name
      // (e.g. "GPT 5.5 Mini" not "gpt-5.5-mini-2026-05-01").
      modelEl.className = 'tre-ctrl-item tre-ctrl-model'
      modelEl.textContent = getModelDisplayName(config.provider, config.model)
      modelEl.style.cssText = ''
    } catch {
      if (statusDot)  { statusDot.className = 'tre-status-dot tre-status-error' }
      if (statusText) { statusText.textContent = 'Offline' }
      if (providerEl) {
        providerEl.className = 'tre-ctrl-item tre-ctrl-provider tre-ctrl-loading'
        providerEl.textContent = 'Provider unavailable'
        providerEl.style.cssText = ''
      }
      if (modelEl) {
        modelEl.className = 'tre-ctrl-item tre-ctrl-model tre-ctrl-loading'
        modelEl.textContent = 'Model unavailable'
        modelEl.style.cssText = ''
      }
    }
  }

  async function translateText (text, settings) {
    const response = await requestBackground('VIEZAN_TRANSLATE', {
      text,
      token: settings.token,
      targetLang: settings.targetLang,
      translationStyle: settings.translationStyle || styleSelect.value || 'general',
    })
    return response.translatedText
  }

  function positionElement (el, rect) {
    const margin = 8
    const elH = el.offsetHeight
    const elW = el.offsetWidth

    // Smart vertical: prefer above selection; fall back to below; clamp if neither fits
    let top
    if (rect.top - elH - margin >= margin) {
      // Enough space above → show above
      top = rect.top - elH - margin
    } else if (rect.bottom + elH + margin <= window.innerHeight - margin) {
      // Enough space below → show below
      top = rect.bottom + margin
    } else {
      // Neither fits perfectly → place as high as possible without going off-screen
      top = Math.max(margin, window.innerHeight - elH - margin)
    }

    // Horizontal: centre on selection, clamped to viewport
    let left = rect.left + rect.width / 2 - elW / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - elW - margin))

    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }

  function resetBtnIcon () {
    btn.classList.remove('tre-loading')
    btn.innerHTML = ''
    const img = document.createElement('img')
    img.src = ICON_URL
    img.alt = 'Viezan'
    btn.appendChild(img)
  }

  function showButton (rect) {
    lastSelectionRect = rect   // save for use in button click handler
    resetBtnIcon()
    btn.style.display = 'flex'

    const btnSize = 36
    const gap = 6
    const margin = 8

    // Smart vertical: prefer below selection; if too close to bottom, show above
    let top
    if (rect.bottom + gap + btnSize <= window.innerHeight - margin) {
      top = rect.bottom + gap
    } else {
      top = rect.top - gap - btnSize
    }
    // Clamp to viewport
    top = Math.max(margin, Math.min(top, window.innerHeight - btnSize - margin))

    // Horizontal: centre on selection, clamped to viewport
    let left = rect.left + rect.width / 2 - btnSize / 2
    left = Math.max(margin, Math.min(left, window.innerWidth - btnSize - margin))

    btn.style.top = `${top}px`
    btn.style.left = `${left}px`
  }

  function hideButton () {
    btn.style.display = 'none'
    resetBtnIcon()
  }

  function renderTooltip (source, resultText, rect) {
    // Left panel: original / source text (the text that was actually translated)
    tooltip.querySelector('.tre-source-text').textContent = String(source || '').replace(/\n{2,}/g, '\n')

    // Right panel: translation result (or notice)
    tooltip.querySelector('.tre-tooltip-text').textContent = String(resultText || '').replace(/\n{2,}/g, '\n')

    tooltip.style.display = 'flex'
    tooltipVisible = true
    copyBtn.textContent = COPY_LABEL
    ttsPlayer.stop()
    // Force reflow so offsetWidth is available
    tooltip.getBoundingClientRect()
    positionElement(tooltip, rect)
  }

  /** Show a message in the tooltip instead of a translation (Copy/Replace stay inert). */
  function showTooltipNotice (message, rect, source) {
    currentTranslation = ''
    currentSource = source || ''
    renderTooltip(currentSource, message, rect)
  }

  function showTooltip (text, rect, range, targetLang, translationStyle, source) {
    currentTranslation = text
    currentSource = source || ''
    // Only update savedRange if a valid range is provided.
    // Clicking the translate button clears the browser selection, so `range`
    // from the btn click handler is often null — we must keep the range that
    // was captured earlier at selection time (mouseup / checkKeyboardSelection).
    if (range) savedRange = range

    // Sync language selector to current target language
    if (targetLang && langSelect.value !== targetLang) {
      langSelect.value = targetLang
    }

    // Sync style selector to current translation style
    if (translationStyle && styleSelect.value !== translationStyle) {
      styleSelect.value = translationStyle
    }

    renderTooltip(currentSource, text, rect)
  }

  function hideTooltip () {
    tooltip.style.display = 'none'
    tooltipVisible = false
    // Dismissing the tooltip (or starting a new selection) cancels any
    // in-flight translation so its late response cannot reappear or hit the clipboard.
    requestSeq++
    ttsPlayer.stop()
  }

  function getElementFromNode (node) {
    if (!node) return null
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement
  }

  function normalizeSelectionText (text) {
    return String(text || '').replace(/\s+/g, ' ').trim()
  }

  function getEditableForRange (range) {
    try {
      let el = getElementFromNode(range.commonAncestorContainer)
      const explicitRoot = el?.closest('[contenteditable]')
      if (explicitRoot) return explicitRoot

      let inheritedRoot = null
      while (el) {
        if (el.isContentEditable) inheritedRoot = el
        el = el.parentElement
      }
      return inheritedRoot
    } catch {
      return null
    }
  }

  function focusElementWithoutScroll (el) {
    if (!el) return
    try {
      el.focus({ preventScroll: true })
    } catch {
      try { el.focus() } catch { /* ignore */ }
    }
  }

  function restoreDomSelection (range, editableEl) {
    if (!range) return false

    focusElementWithoutScroll(editableEl)
    const sel = window.getSelection()
    if (!sel) return false

    try {
      sel.removeAllRanges()
      sel.addRange(range.cloneRange())
    } catch {
      return false
    }

    return normalizeSelectionText(sel.toString()) === normalizeSelectionText(lastSelection)
  }

  function dispatchEditableInput (editableEl, inputType = 'insertText') {
    if (!editableEl) return

    try {
      const event = typeof InputEvent === 'function'
        ? new InputEvent('input', {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType,
          data: currentTranslation,
        })
        : new Event('input', { bubbles: true })
      editableEl.dispatchEvent(event)
      editableEl.dispatchEvent(new Event('change', { bubbles: true }))
    } catch {
      try { editableEl.dispatchEvent(new Event('input', { bubbles: true })) } catch { /* ignore */ }
      try { editableEl.dispatchEvent(new Event('change', { bubbles: true })) } catch { /* ignore */ }
    }
  }

  function replaceRangeWithPlainText (range, text, editableEl) {
    if (!range || !editableEl) return false

    try {
      const workingRange = range.cloneRange()
      workingRange.deleteContents()

      const fragment = document.createDocumentFragment()
      const lines = String(text).split('\n')
      let lastNode = null
      lines.forEach((line, index) => {
        if (index > 0) {
          const br = document.createElement('br')
          fragment.appendChild(br)
          lastNode = br
        }
        const textNode = document.createTextNode(line)
        fragment.appendChild(textNode)
        lastNode = textNode
      })

      workingRange.insertNode(fragment)

      if (lastNode) {
        const sel = window.getSelection()
        const caretRange = document.createRange()
        caretRange.setStartAfter(lastNode)
        caretRange.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(caretRange)
      }

      dispatchEditableInput(editableEl)
      return true
    } catch {
      return false
    }
  }

  // ── Close button ───────────────────────────────────────────────────────────

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    hideTooltip()
  })

  // ── Copy button ────────────────────────────────────────────────────────────

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    // While re-translating (or on an error notice) there is no result to copy; never write ''.
    if (!currentTranslation) return
    try {
      await navigator.clipboard.writeText(currentTranslation)
      copyBtn.textContent = 'Copied'
      setTimeout(() => { copyBtn.textContent = COPY_LABEL }, 1500)
    } catch {
      copyBtn.textContent = 'Failed'
      setTimeout(() => { copyBtn.textContent = COPY_LABEL }, 1500)
    }
  })

  // ── Listen button ──────────────────────────────────────────────────────────

  listenBtn.addEventListener('click', async (e) => {
    e.stopPropagation()

    try {
      const settings = await getSettings()
      if (!settings.token) throw new Error('Missing API key')
      const lang = langSelect.value || settings.targetLang
      await ttsPlayer.play(currentTranslation, lang, settings.token)
    } catch {
      listenBtn.textContent = 'Failed'
      setTimeout(() => { listenBtn.textContent = LISTEN_LABEL }, 1500)
    }
  })

  // ── Language selector → re-translate ──────────────────────────────────────

  /** Re-translate the text currently shown in the tooltip with overridden settings. */
  async function retranslateCurrent (overrides) {
    const source = currentSource || lastSelection
    if (!source) return

    const requestId = ++requestSeq
    const tooltipText = tooltip.querySelector('.tre-tooltip-text')
    ttsPlayer.stop()
    currentTranslation = ''   // never copy/replace a result for the previous language/style
    tooltipText.textContent = 'Translating...'

    try {
      const settings = { ...(await getSettings()), ...overrides }
      const translated = await translateText(source, settings)
      if (requestId !== requestSeq) return   // superseded or dismissed
      currentTranslation = translated
      currentSource = source
      tooltipText.textContent = translated.replace(/\n{2,}/g, '\n')
      copyBtn.textContent = COPY_LABEL
      try { await navigator.clipboard.writeText(translated) } catch { /* ignore */ }
    } catch (err) {
      if (requestId !== requestSeq) return
      tooltipText.textContent = describeError(err)
    }
  }

  langSelect.addEventListener('change', (e) => {
    e.stopPropagation()
    const newLang = langSelect.value

    // Persist the new language choice so Options page & future sessions reflect it
    if (isContextValid()) {
      try { chrome.storage.local.set({ treTargetLang: newLang }) } catch { /* ignore */ }
    }

    retranslateCurrent({ targetLang: newLang })   // use the just-selected language
  })

  // ── Style selector → re-translate ─────────────────────────────────────────

  styleSelect.addEventListener('change', (e) => {
    e.stopPropagation()
    const newStyle = styleSelect.value

    // Persist the new style choice across sessions
    if (isContextValid()) {
      try { chrome.storage.local.set({ treTranslationStyle: newStyle }) } catch { /* ignore */ }
    }

    retranslateCurrent({ translationStyle: newStyle })   // use the just-selected style
  })

  // ── Replace button ─────────────────────────────────────────────────────────

  replaceBtn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!currentTranslation) { hideTooltip(); return }

    // ── Case 1: textarea / input ───────────────────────────────────────────
    if (savedInputEl && typeof savedInputEl.selectionStart === 'number') {
      const el = savedInputEl
      if (!el.isConnected || el.disabled || el.readOnly) {
        replaceBtn.textContent = 'Failed'
        setTimeout(() => { replaceBtn.textContent = REPLACE_LABEL }, 1500)
        return
      }
      // The field may have been edited since the selection was recorded; replacing stale
      // offsets would overwrite the wrong characters, so only proceed if the text still matches.
      if (el.value.substring(savedInputStart, savedInputEnd).trim() !== currentSource.trim()) {
        replaceBtn.textContent = 'Failed'
        setTimeout(() => { replaceBtn.textContent = REPLACE_LABEL }, 1500)
        return
      }
      el.focus()
      el.setSelectionRange(savedInputStart, savedInputEnd)
      // Try native insertText first (preserves undo history)
      const ok = document.execCommand('insertText', false, currentTranslation)
      if (!ok) {
        // Fallback: direct value manipulation
        const before = el.value.substring(0, savedInputStart)
        const after  = el.value.substring(savedInputEnd)
        el.value = before + currentTranslation + after
        el.setSelectionRange(
          savedInputStart + currentTranslation.length,
          savedInputStart + currentTranslation.length
        )
        el.dispatchEvent(new Event('input',  { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      hideTooltip()
      return
    }

    // ── Case 2: contenteditable / DOM selection ────────────────────────────
    if (savedRange) {
      const range = savedRange.cloneRange()
      const editableEl = getEditableForRange(range)
      let handled = false

      // Restore the exact DOM range captured before the tooltip/button stole focus.
      // Clipboard paste is intentionally avoided here: several markdown editors keep
      // their own internal caret and paste at the end of the document when focus was
      // moved through an intermediate textarea.
      if (editableEl && restoreDomSelection(range, editableEl)) {
        handled = replaceRangeWithPlainText(range, currentTranslation, editableEl)
      }

      if (!handled && !editableEl && restoreDomSelection(range, editableEl)) {
        try {
          handled = document.execCommand('insertText', false, currentTranslation)
        } catch { /* ignore */ }
      }

      if (!handled) {
        replaceBtn.textContent = 'Failed'
        setTimeout(() => { replaceBtn.textContent = REPLACE_LABEL }, 1500)
        return
      }
    }

    hideTooltip()
  })

  // ── Selection listener — mouse ─────────────────────────────────────────────

  document.addEventListener('mouseup', (e) => {
    if (e.target === btn || btn.contains(e.target)) return
    if (e.target === tooltip || tooltip.contains(e.target)) return

    setTimeout(() => {
      const sel = window.getSelection()
      const text = sel ? sel.toString().trim() : ''

      // Mouse selection inside <input>/<textarea>: window.getSelection() has no
      // usable range there, so record the element and its selection bounds
      // (same data the keyboard path stores) to keep Replace working.
      const activeEl = document.activeElement
      const activeTag = activeEl?.tagName?.toLowerCase()
      if ((activeTag === 'input' || activeTag === 'textarea') && typeof activeEl.selectionStart === 'number') {
        const start = activeEl.selectionStart
        const end = activeEl.selectionEnd
        const inputText = end > start ? activeEl.value.substring(start, end).trim() : ''
        if (inputText.length > 1) {
          lastSelection = inputText
          savedInputEl    = activeEl
          savedInputStart = start
          savedInputEnd   = end
          savedRange      = null
          showButton(activeEl.getBoundingClientRect())
          hideTooltip()
          return
        }
      }

      if (text.length > 1) {
        lastSelection = text
        savedInputEl = null  // this is a DOM selection, not textarea
        // Save range NOW while selection is still alive (before btn click clears it)
        try { savedRange = sel.getRangeAt(0).cloneRange() } catch { savedRange = null }
        const rect = savedRange ? savedRange.getBoundingClientRect() : { top: 80, bottom: 100, left: window.innerWidth / 2, width: 0 }
        showButton(rect)
        hideTooltip()
      } else {
        hideButton()
      }
    }, 10)
  }, { signal: listenerSignal })

  // ── Selection listener — keyboard (Cmd+A / Ctrl+A / Shift+Arrow etc.) ──────

  function checkKeyboardSelection () {
    const activeEl = document.activeElement
    const tag = activeEl?.tagName?.toLowerCase()

    // input/textarea: window.getSelection() doesn't work — use selectionStart/End
    if ((tag === 'input' || tag === 'textarea') && typeof activeEl.selectionStart === 'number') {
      const start = activeEl.selectionStart
      const end = activeEl.selectionEnd
      if (end > start) {
        const text = activeEl.value.substring(start, end).trim()
        if (text.length > 1) {
          lastSelection = text
          // Save textarea reference + selection bounds for Replace
          savedInputEl    = activeEl
          savedInputStart = start
          savedInputEnd   = end
          savedRange      = null  // not applicable for textarea
          // Position button near the bottom of the input element
          const rect = activeEl.getBoundingClientRect()
          showButton(rect)
          hideTooltip()
          return
        }
      }
      // Selection collapsed/too short: also cancel any in-flight translation of the old one.
      hideButton()
      hideTooltip()
      return
    }

    // Normal DOM selection (page text, contenteditable, etc.)
    savedInputEl = null  // reset textarea state — this is a DOM selection
    const sel = window.getSelection()
    const text = sel ? sel.toString().trim() : ''

    if (text.length > 1) {
      lastSelection = text
      let rect = null
      try {
        if (sel.rangeCount > 0) {
          // Save range NOW while selection is alive (keyboard selection is still active)
          savedRange = sel.getRangeAt(0).cloneRange()
          rect = savedRange.getBoundingClientRect()
        }
      } catch { /* ignore */ }

      // Fallback if rect is empty (e.g., Ctrl+A on whole page)
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        rect = { top: 80, bottom: 100, left: window.innerWidth / 2, width: 0 }
      }

      showButton(rect)
      hideTooltip()
    } else {
      hideButton()
      hideTooltip()
    }
  }

  document.addEventListener('keyup', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase()
    const isSelectAll = (e.metaKey || e.ctrlKey) && e.key === 'a'
    const isShiftSelection = e.shiftKey && (
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
      e.key === 'Home' || e.key === 'End' ||
      e.key === 'PageUp' || e.key === 'PageDown'
    )

    // For input/textarea: only show button on Cmd+A (select-all), not Shift+Arrow
    // (Shift+Arrow in inputs is normal editing — don't interrupt that)
    if (tag === 'input' || tag === 'textarea') {
      if (isSelectAll) setTimeout(checkKeyboardSelection, 50)
      return
    }

    // Outside inputs: trigger on Cmd+A or Shift+Arrow-based selections
    if (isSelectAll || isShiftSelection) {
      setTimeout(checkKeyboardSelection, 50)
    }
  }, { signal: listenerSignal })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideButton()
      hideTooltip()
      return
    }

    // CMD+A (macOS) / CTRL+A (Windows/Linux) — must be caught on keydown because
    // macOS does NOT fire keyup for CMD+key shortcuts (OS intercepts them).
    const isSelectAll = (e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')
    if (isSelectAll) {
      // Wait a tick for the browser to apply the full-page selection
      setTimeout(checkKeyboardSelection, 100)
    }

    // ── Tooltip keyboard shortcuts (only when tooltip is visible) ─────────
    if (tooltipVisible && currentTranslation) {
      const mod = e.metaKey || e.ctrlKey
      // Cmd/Ctrl+C → Copy translation
      if (mod && e.key === 'c') {
        e.preventDefault()
        copyBtn.click()
      }
      // Cmd/Ctrl+Enter → Replace
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        replaceBtn.click()
      }
    }
  }, { signal: listenerSignal })

  document.addEventListener('mousedown', (e) => {
    if (
      e.target !== btn && !btn.contains(e.target) &&
      e.target !== tooltip && !tooltip.contains(e.target)
    ) {
      hideButton()
      hideTooltip()
    }
  }, { signal: listenerSignal })

  // ── Button click → translate ──────────────────────────────────────────────

  btn.addEventListener('click', async () => {
    const text = lastSelection
    if (!text) return

    // Ignore a second click while the current request is still in flight
    if (pendingBtnId && pendingBtnId === requestSeq) return
    const requestId = ++requestSeq
    pendingBtnId = requestId

    // Show loading spinner inside the round button
    btn.classList.add('tre-loading')
    btn.innerHTML = '<span class="tre-inline-spinner" aria-hidden="true"></span>'

    // Determine rect for tooltip positioning:
    // - For DOM selections (page text): use getSelection range
    // - For input/textarea (Cmd+A): use lastSelectionRect saved when button was shown
    const sel = window.getSelection()
    let rect = lastSelectionRect || { top: 100, bottom: 120, left: 100, width: 100 }
    let range = null
    if (sel && sel.rangeCount > 0) {
      range = sel.getRangeAt(0).cloneRange()
      const selRect = range.getBoundingClientRect()
      if (selRect && selRect.width > 0) rect = selRect
    }

    try {
      const settings = await getSettings()
      if (requestId !== requestSeq) return
      if (!settings.token) {
        hideButton()
        showTooltipNotice('Please set your connection API key in the extension Options page first.', rect, text)
        return
      }

      const translated = await translateText(text, settings)
      if (requestId !== requestSeq) return   // stale: newer request or dismissed
      hideButton()
      showTooltip(translated, rect, range, settings.targetLang, settings.translationStyle, text)
      // Update provider/model info in header (non-blocking)
      updateAiInfo(settings.token)

      try { await navigator.clipboard.writeText(translated) } catch { /* ignore */ }
    } catch (err) {
      if (requestId !== requestSeq) return
      hideButton()
      if ((err?.message || '').includes('context invalidated')) {
        retireInvalidContextUi()
      } else {
        showTooltipNotice(describeError(err), rect, text)
      }
    } finally {
      if (pendingBtnId === requestId) pendingBtnId = 0
    }
  })

  // ── Ping handler (used by background to check if this script is alive) ────────
  // background.js sends VIEZAN_PING periodically; if we respond, it knows the context
  // is valid and skips re-injection. No response = dead context = re-inject.

  function onRuntimeMessage (msg, sender, sendResponse) {
    // Only accept messages from this extension's own background worker.
    if (!isContextValid() || sender?.id !== chrome.runtime.id) return

    if (msg?.type === 'VIEZAN_PING') {
      sendResponse({ alive: true })
      return true
    }

    // ── Context menu: translate the selection text reported by Chrome ──────
    if (msg?.type === 'VIEZAN_TRANSLATE_SELECTION') {
      const text = typeof msg.text === 'string' ? msg.text.trim() : ''
      if (!text) {
        sendResponse({ ok: false })
        return true
      }

      lastSelection = text
      let rect = null
      const activeEl = document.activeElement
      const tag = activeEl?.tagName?.toLowerCase()
      const sel = window.getSelection()

      // Re-derive replace targets from the live selection, but only when it is
      // the text Chrome reported; otherwise Replace would hit the wrong place.
      if ((tag === 'input' || tag === 'textarea') && typeof activeEl.selectionStart === 'number' &&
          activeEl.selectionEnd > activeEl.selectionStart &&
          normalizeSelectionText(activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd)) === normalizeSelectionText(text)) {
        savedInputEl    = activeEl
        savedInputStart = activeEl.selectionStart
        savedInputEnd   = activeEl.selectionEnd
        savedRange      = null
        rect = activeEl.getBoundingClientRect()
      } else {
        savedInputEl = null
        savedRange = null
        if (sel && sel.rangeCount > 0 && normalizeSelectionText(sel.toString()) === normalizeSelectionText(text)) {
          try {
            savedRange = sel.getRangeAt(0).cloneRange()
            rect = savedRange.getBoundingClientRect()
          } catch { savedRange = null }
        }
      }

      if (!rect || (rect.width === 0 && rect.height === 0)) {
        rect = lastSelectionRect || { top: 100, bottom: 120, left: window.innerWidth / 2, width: 0 }
      }
      showButton(rect)
      setTimeout(() => btn.click(), 50)
      sendResponse({ ok: true })
      return true
    }

    // ── Keyboard shortcut: translate currently selected text ───────────────
    if (msg?.type === 'VIEZAN_TRANSLATE_SHORTCUT') {
      const activeEl = document.activeElement
      const tag = activeEl?.tagName?.toLowerCase()

      // Case 1: textarea / input selection
      if ((tag === 'input' || tag === 'textarea') && typeof activeEl.selectionStart === 'number') {
        const start = activeEl.selectionStart
        const end = activeEl.selectionEnd
        if (end > start) {
          const text = activeEl.value.substring(start, end).trim()
          if (text.length > 1) {
            lastSelection = text
            savedInputEl    = activeEl
            savedInputStart = start
            savedInputEnd   = end
            savedRange      = null
            const rect = activeEl.getBoundingClientRect()
            showButton(rect)
            setTimeout(() => btn.click(), 50)
            sendResponse({ ok: true })
            return true
          }
        }
      }

      // Case 2: DOM / contenteditable selection
      const sel = window.getSelection()
      const text = sel ? sel.toString().trim() : ''
      if (text.length > 1) {
        lastSelection = text
        savedInputEl = null
        try { savedRange = sel.getRangeAt(0).cloneRange() } catch { savedRange = null }
        const rect = savedRange ? savedRange.getBoundingClientRect() : { top: 100, bottom: 120, left: window.innerWidth / 2, width: 0 }
        showButton(rect)
        setTimeout(() => btn.click(), 50)
      } else if (btn.style.display !== 'none') {
        // Floating button already visible from a prior selection — just trigger it
        btn.click()
      }

      sendResponse({ ok: true })
      return true
    }
  }

  chrome.runtime.onMessage.addListener(onRuntimeMessage)

  // Expose liveness/teardown so a later injection can stay idempotent.
  globalThis.__viezanContent = {
    isAlive: isContextValid,
    dispose () {
      listenerAbort.abort()
      try { chrome.runtime.onMessage.removeListener(onRuntimeMessage) } catch { /* ignore */ }
      retireInvalidContextUi()
    },
  }

})()
