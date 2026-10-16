import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const url = process.argv[2]
assert(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname))
const output = process.argv[3]
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
try {
  for (const locale of ['en', 'vi', 'ja']) {
    for (const width of [1200, 800, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', err => errors.push(err.message))
      await page.goto(url)
      await page.locator('.chat-page').waitFor()
      await page.evaluate(async ({ locale, width }) => {
        const entry = performance.getEntriesByType('resource').find(e => e.name.includes('/src/store/useAppStore.ts'))
        const { useAppStore } = await import(entry.name)
        window.qaStore = useAppStore
        useAppStore.setState({ locale, localeAuto: false, theme: width === 800 ? 'dark' : 'light', activePage: 'translate',
          sourceLang: 'vi', targetLang: 'ja', liveSourceLang: 'auto', liveTargetLang: 'vi',
          pinnedLanguagePairs: [{ source: 'vi', target: 'ja' }, { source: 'vi', target: 'en' }, { source: 'auto', target: 'vi' }],
          languagePairDirections: { translate: {}, live: {} } })
      }, { locale, width })
      for (const feature of ['translate', 'live']) {
        await page.evaluate(feature => window.qaStore.getState().setActivePage(feature), feature)
        await page.locator('.language-pair-controls').waitFor()
        const fields = page.locator('.language-pair-fields')
        const controls = fields.locator('button')
        assert.equal(await controls.count(), 4)
        const bounds = await controls.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }))
        for (const b of bounds) assert(b.left >= 0 && b.right <= width, `${feature} ${width}: offscreen control`)
        assert(bounds[0].right <= bounds[1].left && bounds[1].right <= bounds[2].left, `${feature}: controls overlap`)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await controls.first().click()
        await page.getByRole('searchbox').fill('English')
        await page.keyboard.press('Escape')
        const before = await fields.boundingBox()
        await page.locator('.language-pair-trigger').click()
        const panel = page.getByRole('dialog').last()
        await panel.waitFor()
        const panelBounds = await panel.boundingBox()
        assert(panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= width)
        assert.equal(await panel.evaluate(node => getComputedStyle(node).position), 'fixed')
        assert.deepEqual(await fields.boundingBox(), before, 'Popover must not resize the header')
        if (output) await page.screenshot({ path: path.join(output, `popover-${feature}-${locale}-${width}.png`), animations: 'disabled' })
        assert.equal(await page.locator('.language-pair-menu-row').count(), 3)
        await page.locator('.language-pair-menu-row').nth(1).locator('button').first().click()
        const state = await page.evaluate(feature => { const s = window.qaStore.getState(); return feature === 'live' ? [s.liveSourceLang, s.liveTargetLang] : [s.sourceLang, s.targetLang] }, feature)
        assert.deepEqual(state, ['vi', 'en'])
        assert.equal(await page.locator('.language-pair-popover').count(), 0)
        if (output) await page.screenshot({ path: path.join(output, `${feature}-${locale}-${width}.png`), animations: 'disabled' })
      }
      await page.evaluate(() => {
        window.api.translate = async ({ provider }) => ({ success: true, translatedText: `Result from ${provider}` })
        window.qaStore.setState({ activePage: 'translate', autoTranslate: false, sourceText: 'Hello', sourceLang: 'en', targetLang: 'vi',
          translationModels: [{ provider: 'local', model: 'local-auto' }, { provider: 'gemini', model: 'gemini-test' }, { provider: 'openai', model: 'gpt-test' }],
          keyStatus: { local: true, gemini: true, claude: false, openai: true } })
      })
      await page.locator('.translate-submit-button').click()
      await page.locator('.translate-comparison-card-actions').first().waitFor()
      assert.equal(await page.locator('.translate-swap-button').isEnabled(), true)
      assert.equal(await page.locator('.translate-workbench').evaluate(node => node.scrollLeft), 0, 'Comparison must not scroll its language header sideways')
      assert.equal(await page.locator('.translate-swap-button svg').evaluate(node => getComputedStyle(node).transform), 'none')
      const comparisonBounds = await page.locator('.language-pair-fields button').evaluateAll(nodes => nodes.map(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })))
      for (const b of comparisonBounds) assert(b.left >= 0 && b.right <= width, 'Comparison language control is clipped')
      if (output) await page.screenshot({ path: path.join(output, `comparison-${locale}-${width}.png`), animations: 'disabled' })
      await page.locator('.translate-comparison-card-actions button').first().click()
      assert.equal(await page.evaluate(() => window.qaStore.getState().sourceText), 'Result from local')
      assert.deepEqual(errors, [])
      console.log(`Language pair layouts passed: ${locale}, ${width}px, Translate + Live`)
      await page.close()
    }
  }
} finally { await browser.close() }
