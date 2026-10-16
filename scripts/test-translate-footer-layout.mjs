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
  const page = await browser.newPage()
  await page.goto(url)
  await page.locator('.chat-page').waitFor()
  await page.evaluate(async () => {
    const entry = performance.getEntriesByType('resource').find(e => e.name.includes('/src/store/useAppStore.ts'))
    window.qaStore = (await import(entry.name)).useAppStore
  })
  for (const locale of ['vi', 'en', 'ja']) {
    for (const width of [1195, 1000, 800, 390]) {
      await page.setViewportSize({ width, height: 697 })
      for (const sidebarCollapsed of [true, false]) {
        for (const count of [1, 3]) {
          for (const sourceText of ['', 'Hello']) {
            await page.evaluate(({ locale, sidebarCollapsed, count, sourceText }) => window.qaStore.setState({
              activePage: 'translate', locale, localeAuto: false, sidebarCollapsed, autoTranslate: false,
              sourceText, sourceLang: 'auto', targetLang: 'ja', translatedText: '',
              translationModels: [{ provider: 'local', model: 'local-auto' }, { provider: 'gemini', model: 'gemini-test' }, { provider: 'openai', model: 'gpt-test' }].slice(0, count),
            }), { locale, sidebarCollapsed, count, sourceText })
            await page.locator('.translate-workbench').waitFor()
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
            const errors = await page.evaluate(() => {
              const footer = document.querySelector('.translate-source-footer')
              const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
              const elements = [...footer.querySelectorAll('button, .translate-char-count, .translate-shortcut-hint, .translate-comparison-request-notice')].filter(visible)
              const problems = []
              const bounds = footer.getBoundingClientRect()
              const boxes = elements.map(el => ({ rect: el.getBoundingClientRect(), name: el.textContent || el.getAttribute('aria-label') }))
              for (let i = 0; i < boxes.length; i++) {
                const a = boxes[i]
                if (a.rect.left < bounds.left - 1 || a.rect.right > bounds.right + 1) problems.push(`Outside footer: ${a.name}`)
                for (const b of boxes.slice(i + 1)) {
                  if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 1 && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 1) problems.push(`Overlap: ${a.name} / ${b.name}`)
                }
              }
              const source = document.querySelector('.translate-source-pane').getBoundingClientRect()
              const result = document.querySelector('.translate-result-pane').getBoundingClientRect()
              if (Math.abs(source.top - result.top) < 1) {
                const swap = document.querySelector('.translate-swap-button').getBoundingClientRect()
                if (Math.abs((swap.left + swap.right) / 2 - result.left) > 2) problems.push('Swap is not centered on the pane divider')
              }
              return problems
            })
            const label = `${locale}-${width}-${sidebarCollapsed ? 'rail' : 'expanded'}-${count}-${sourceText ? 'filled' : 'empty'}`
            if (output && (errors.length || (locale === 'vi' && sidebarCollapsed && !sourceText))) await page.screenshot({ path: path.join(output, `${label}.png`), animations: 'disabled' })
            assert.deepEqual(errors, [], label)
          }
        }
      }
      console.log(`Footer + language alignment passed: ${locale}, ${width}px, 1/3 models, empty/filled, rail/expanded`)
    }
  }
} finally { await browser.close() }
