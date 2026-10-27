import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

// Runs against a dedicated web preview with synthetic content and real IndexedDB.
const url = process.env.VIEZAN_SESSION_TEST_URL || 'http://127.0.0.1:5174'
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(macChrome) ? macChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: 'en-US' })
  const errors = []
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Page error:', error.message) })
  await page.addInitScript(() => {
    let api
    window.sessionTestCalls = 0
    Object.defineProperty(window, 'api', { configurable: true, get: () => api, set: (value) => {
      api = value
      for (const name of ['translate', 'translateImage', 'chat', 'chatStream', 'detectLanguage']) {
        if (!value[name]) continue
        const original = value[name]
        value[name] = (...args) => { window.sessionTestCalls++; return original(...args) }
      }
    } })
  })
  const setState = (state) => page.evaluate(async (value) => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.setState(value)
  }, state)
  const flush = () => page.evaluate(async () => {
    const { flushPersistedStore } = await import('/src/store/useAppStore.ts')
    const { workbenchRecovery } = await import('/src/services/workbenchRecovery.ts')
    if (!flushPersistedStore() || !await workbenchRecovery.flush()) throw new Error('Save failed')
  })
  const age = (feature) => page.evaluate(async (key) => {
    const { workbenchRecovery } = await import('/src/services/workbenchRecovery.ts')
    const record = workbenchRecovery.get(key)
    if (!record) throw new Error('Missing recovery record')
    record.awayAt = Date.now() - 3 * 60 * 60 * 1000
    if (record.completedAt !== null) record.completedAt = record.awayAt
    window.dispatchEvent(new Event('focus'))
  }, feature)

  await page.goto(url)
  await page.getByRole('button', { name: /^AI Translate$/ }).first().waitFor()
  await setState({ activePage: 'translate', autoTranslate: false, sourceLang: 'en', targetLang: 'vi', localeAuto: false })
  console.log('Opening translation draft')
  await page.locator('textarea').first().fill('An unfinished draft survives overnight')
  await flush()
  await setState({ activePage: 'home' })
  await page.locator('.translate-page').waitFor({ state: 'detached' })
  await setState({ autoTranslate: true, activePage: 'translate' })
  await page.locator('textarea').first().waitFor()
  await flush()
  await page.reload()
  await page.locator('textarea').first().waitFor()
  assert.equal(await page.locator('textarea').first().inputValue(), 'An unfinished draft survives overnight')
  await page.waitForTimeout(1100)
  assert.equal(await page.evaluate(() => window.sessionTestCalls), 0, 'Restoring a draft called AI')
  await age('translate')
  assert.equal(await page.locator('textarea').first().inputValue(), 'An unfinished draft survives overnight')

  // A new edit deliberately resumes Auto Translate; then a long absence starts fresh.
  await page.locator('textarea').first().fill('Hello, how are you?')
  await page.getByText('Xin chào, bạn khỏe không?', { exact: true }).first().waitFor()
  await flush()
  await age('translate')
  await page.getByRole('button', { name: 'Open previous work' }).waitFor()
  assert.equal(await page.locator('textarea').first().inputValue(), '')
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  for (const width of [1200, 820]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 })
      await setState({ theme })
      await page.screenshot({ path: `/tmp/viezan-session-${width}-${theme}.png` })
      assert(await page.locator('.workbench-session-notice').evaluate((node) => node.scrollWidth <= node.clientWidth), 'Recovery notice overflows')
    }
  }
  console.log('Completed translation resets and reopens')
  const callsBeforeRestore = await page.evaluate(() => window.sessionTestCalls)
  await page.getByRole('button', { name: 'Open previous work' }).click()
  await page.waitForTimeout(1100)
  assert.equal(await page.locator('textarea').first().inputValue(), 'Hello, how are you?')
  assert.equal(await page.evaluate(() => window.sessionTestCalls), callsBeforeRestore, 'Opening previous work called AI')
  await page.getByRole('button', { name: 'Use as source', exact: true }).click()
  await page.waitForFunction((before) => window.sessionTestCalls > before, callsBeforeRestore)
  assert.equal(await page.locator('textarea').first().inputValue(), 'Xin chào, bạn khỏe không?')

  // Dictionary drafts survive navigation and reload without a lookup.
  await setState({ activePage: 'dictionary' })
  const term = page.getByLabel('Term', { exact: true })
  await term.fill('unfinished word')
  await flush()
  await page.reload()
  await term.waitFor()
  assert.equal(await term.inputValue(), 'unfinished word')
  assert.equal(await page.evaluate(() => window.sessionTestCalls), 0)

  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    const state = useAppStore.getState()
    state.addDictionaryEntry({ id: 'browser-entry', term: 'bank', normalizedTerm: 'bank',
      sourceLang: state.sourceLang, targetLang: state.targetLang, provider: state.selectedProvider,
      model: state.selectedModels[state.selectedProvider], createdAt: Date.now(), favorite: true,
      result: { headword: 'bank', pronunciation: '', partOfSpeech: ['noun'], meaning: 'A river bank',
        translations: [{ text: 'bờ sông', meaning: 'The land beside a river', usage: 'Beside the river' }], examples: [], notes: [] } })
  })
  await term.fill('bank')
  await page.getByRole('button', { name: 'Look up', exact: true }).click()
  await flush()
  await age('dictionary')
  await page.getByRole('button', { name: 'Open previous work' }).waitFor()
  assert.equal(await term.inputValue(), '')
  assert.equal(await page.evaluate(() => window.sessionTestCalls), 0)
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  for (const locale of ['vi', 'ja']) {
    await setState({ locale, theme: 'dark' })
    await page.waitForTimeout(50)
    await page.screenshot({ path: `/tmp/viezan-dictionary-session-${locale}.png` })
    assert(await page.locator('.workbench-session-notice').evaluate((node) => node.scrollWidth <= node.clientWidth))
  }
  await setState({ locale: 'en' })
  await page.getByRole('button', { name: 'Open previous work' }).click()
  assert.equal(await term.inputValue(), 'bank')
  console.log('Dictionary drafts, expiry and favorites passed')

  // Image drafts live in IndexedDB and remain readable after a reload.
  await setState({ activePage: 'translate', autoTranslate: false })
  await page.locator('.translate-page').waitFor()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  await page.locator('input[type=file]').setInputFiles({ name: 'recovery-draft.png', mimeType: 'image/png', buffer: png })
  await page.getByAltText('recovery-draft.png').waitFor()
  await flush()
  await page.reload()
  await page.getByAltText('recovery-draft.png').waitFor()
  assert(await page.getByAltText('recovery-draft.png').evaluate((image) => image.complete && image.naturalWidth > 0))
  assert.equal(await page.evaluate(() => window.sessionTestCalls), 0)
  console.log('Image draft reload passed')

  // Multiple model results survive a real page reload with no repeated requests.
  await setState({ activePage: 'home' })
  await page.locator('.translate-page').waitFor({ state: 'detached' })
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.getState().clearTranslation()
    useAppStore.setState({ sourceLang: 'en', targetLang: 'vi', translationModels: [{ provider: 'local', model: 'local-auto' }, { provider: 'local', model: 'qwen3:4b' }], activePage: 'translate' })
  })
  await page.locator('textarea').first().fill('Hello, how are you?')
  await page.getByRole('button', { name: 'Translate · 2 models', exact: true }).click()
  await page.waitForFunction(async () => {
    const { workbenchRecovery } = await import('/src/services/workbenchRecovery.ts')
    return workbenchRecovery.get('translate')?.snapshot.comparisonResults.filter((result) => result.status === 'success').length === 2
  })
  await flush()
  await page.reload()
  await page.getByText('Xin chào, bạn khỏe không?', { exact: true }).first().waitFor()
  assert.equal(await page.evaluate(async () => (await import('/src/services/workbenchRecovery.ts')).workbenchRecovery.get('translate').snapshot.comparisonResults.length), 2)
  assert.equal(await page.evaluate(() => window.sessionTestCalls), 0)
  console.log('Comparison reload passed')

  // Saved chat selection and its text draft survive a restart.
  const id = await page.evaluate(async () => {
    const { useAppStore, flushPersistedStore } = await import('/src/store/useAppStore.ts')
    const state = useAppStore.getState()
    const id = state.createChatSession('local', 'qwen3:4b')
    state.setChatSessionDraft(id, 'Continue my research tomorrow')
    state.setActivePage('chat')
    flushPersistedStore()
    return id
  })
  await page.locator('.chat-input-field').waitFor()
  await page.reload()
  await page.locator('.chat-input-field').waitFor()
  assert.equal(await page.locator('.chat-input-field').inputValue(), 'Continue my research tomorrow')
  assert.equal(await page.evaluate(async () => (await import('/src/store/useAppStore.ts')).useAppStore.getState().activeChatSessionId), id)
  assert.equal(await page.evaluate(() => window.sessionTestCalls), 0)
  assert.deepEqual(errors, [])
  console.log('Session browser checks passed: durable drafts, return policy, reopen, no AI on recovery, chat selection, visual widths/themes.')
} finally {
  await browser.close()
}
