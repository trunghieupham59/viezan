import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const url = process.env.VIEZAN_APPS_TEST_URL || 'http://127.0.0.1:5184'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) })
mkdirSync('/private/tmp/viezan-apps-qa', { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.locator('.app-page').waitFor()
  const state = value => page.evaluate(async next => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.setState(next)
  }, value)
  await state({ activePage: 'apps', locale: 'en' })
  await page.getByRole('button', { name: 'Sample Notes', exact: true }).click()
  await page.locator('.apps-items').waitFor()
  let layouts = 0
  for (const locale of ['en', 'vi', 'ja']) for (const width of [1200, 820, 560]) for (const theme of ['light', 'dark']) for (const fontSize of ['small', 'medium', 'large']) {
    await page.setViewportSize({ width, height: 900 })
    await state({ locale, theme, fontSize })
    await page.waitForTimeout(80)
    assert(await page.locator('.apps-page').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${locale}/${width}/${theme}: page overflow`)
    assert(await page.locator('.apps-grid').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${locale}/${width}/${theme}: grid overflow`)
    assert.equal(await page.locator('.apps-items input:disabled:checked').count(), 1)
    if (fontSize === 'medium' && ((locale === 'vi' && width === 1200 && theme === 'light') || (locale === 'ja' && width === 820 && theme === 'dark'))) {
      await page.screenshot({ path: `/private/tmp/viezan-apps-qa/apps-${locale}-${width}-${theme}.png` })
    }
    layouts++
  }
  await state({ locale: 'en', theme: 'light' })
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  assert.equal(await page.locator('.apps-items input:disabled:checked').count(), 0)
  await page.getByRole('button', { name: 'Review confirmation' }).click()
  await page.locator('.apps-session').waitFor()
  await page.locator('.apps-session summary').click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.apps-session button')?.disabled)
  assert.deepEqual(errors, [])
  console.log(`PASS: ${layouts} localized layouts, selection protection, reset and Undo; synthetic web-preview data only.`)
} finally { await browser.close() }
