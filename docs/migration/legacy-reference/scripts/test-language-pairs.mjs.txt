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
          recentLanguagePairs: [{ source: 'ja', target: 'en' }],
          languagePairDirections: { translate: {}, live: {} } })
      }, { locale, width })
      for (const feature of ['translate', 'live']) {
        await page.evaluate(feature => window.qaStore.getState().setActivePage(feature), feature)
        const bar = page.locator('.language-pair-bar')
        await bar.waitFor()
        const controls = bar.locator('button')
        // Live keeps Auto, so its middle slot is a static arrow rather than a swap button.
        assert.equal(await controls.count(), feature === 'live' ? 2 : 3)
        const bounds = await controls.evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }))
        for (const b of bounds) assert(b.left >= 0 && b.right <= width, `${feature} ${width}: offscreen control`)
        for (let i = 1; i < bounds.length; i += 1) assert(bounds[i - 1].right <= bounds[i].left + 0.5, `${feature}: controls overlap`)
        const barBox = await bar.boundingBox()
        assert(barBox.width <= width, `${feature} ${width}: bar wider than the viewport`)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await bar.locator('.language-pair-half--source').click()
        await page.getByRole('searchbox').fill('English')
        await page.keyboard.press('Escape')
        const before = await bar.boundingBox()
        await bar.locator('.language-pair-half--target').click()
        const panel = page.getByRole('dialog').last()
        await panel.waitFor()
        const panelBounds = await panel.boundingBox()
        assert(panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= width)
        assert.equal(await panel.evaluate(node => getComputedStyle(node).position), 'fixed')
        assert.deepEqual(await bar.boundingBox(), before, 'Popover must not resize the bar')
        if (output) await page.screenshot({ path: path.join(output, `popover-${feature}-${locale}-${width}.png`), animations: 'disabled' })
        // Three pinned pairs first, then the one recent pair.
        assert.equal(await panel.locator('.language-picker-chip').count(), 4)
        await panel.locator('.language-picker-chip').nth(1).locator('.language-picker-chip-select').click()
        const state = await page.evaluate(feature => { const s = window.qaStore.getState(); return feature === 'live' ? [s.liveSourceLang, s.liveTargetLang] : [s.sourceLang, s.targetLang] }, feature)
        assert.deepEqual(state, ['vi', 'en'])
        assert.equal(await page.getByRole('dialog').count(), 0)
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
      assert.equal(await page.locator('.language-pair-swap-button').isEnabled(), true)
      assert.equal(await page.locator('.translate-workbench').evaluate(node => node.scrollLeft), 0, 'Comparison must not scroll sideways')
      const comparisonBounds = await page.locator('.language-pair-bar button').evaluateAll(nodes => nodes.map(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })))
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
