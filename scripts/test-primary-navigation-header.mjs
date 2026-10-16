import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// Run against a web-preview server; optionally save visual QA screenshots.
const url = process.argv[2] ?? 'http://127.0.0.1:5173'
const screenshotDirectory = process.argv[3]
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  const sidebar = page.locator('[data-sidebar-scope="primary"]')
  const toggle = page.locator('.app-titlebar-drag .primary-navigation-toggle')
  const iconPaths = new Map()
  const checkToggle = async expanded => {
    const label = expanded ? 'Collapse sidebar' : 'Expand sidebar'
    assert.equal(await toggle.getAttribute('aria-expanded'), String(expanded))
    assert.equal(await toggle.getAttribute('aria-label'), label)
    assert.equal(await toggle.getAttribute('title'), label)
    const drawing = await toggle.locator('svg path').evaluateAll(paths => paths.map(p => p.getAttribute('d')).join('|'))
    if (iconPaths.has(expanded)) assert.equal(drawing, iconPaths.get(expanded))
    iconPaths.set(expanded, drawing)
    if (iconPaths.size === 2) assert.notEqual(iconPaths.get(true), iconPaths.get(false), 'Expand and collapse icons must differ')
  }
  const snapshot = async name => {
    if (screenshotDirectory) {
      await page.waitForTimeout(250) // Let the existing sidebar width transition settle.
      await page.screenshot({ path: path.join(screenshotDirectory, `${name}.png`) })
    }
  }
  await toggle.waitFor()
  assert.equal(await sidebar.locator('.primary-navigation-toggle').count(), 0)
  assert.equal(await toggle.evaluate(button => getComputedStyle(button).getPropertyValue('-webkit-app-region')), 'no-drag')
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
  await checkToggle(true)
  await page.getByRole('button', { name: 'AI Translate', exact: true }).click()
  await page.locator('.translate-source-pane').waitFor()
  await snapshot('desktop-expanded')
  await toggle.click()
  await sidebar.locator(':scope[data-user-collapsed="true"]').waitFor()
  await checkToggle(false)
  await snapshot('desktop-collapsed')
  // The store debounces persistence; wait until the preference reaches storage.
  await page.waitForFunction(() => Object.values(localStorage).some(value => {
    try { return JSON.parse(value)?.state?.sidebarCollapsed === true } catch { return false }
  }))
  await page.reload()
  await sidebar.locator(':scope[data-collapsed="true"]').waitFor()
  await toggle.click()
  await sidebar.locator(':scope[data-collapsed="false"]').waitFor()
  await page.getByRole('button', { name: 'AI Translate', exact: true }).click()

  for (const width of [900, 899, 800, 480]) {
    await page.setViewportSize({ width, height: 900 })
    await page.locator(`[data-sidebar-scope="primary"][data-responsive-compact="${width < 900}"]`).waitFor()
    assert.equal(await sidebar.getAttribute('data-user-collapsed'), 'false')
    if (width >= 900) continue
    await checkToggle(false)
    await snapshot(`compact-collapsed-${width}`)
    await toggle.click()
    const overlay = page.locator('.primary-navigation-panel[data-overlay-open="true"]')
    await overlay.waitFor()
    await checkToggle(true)
    const headerBounds = await toggle.boundingBox()
    const panelBounds = await overlay.boundingBox()
    assert(headerBounds.y + headerBounds.height <= panelBounds.y, 'Overlay covers the header toggle')
    await snapshot(`compact-overlay-${width}`)
    await toggle.click()
    await overlay.waitFor({ state: 'detached' })
    await checkToggle(false)
    await toggle.click()
    await overlay.waitFor()
    await page.keyboard.press('Escape')
    await overlay.waitFor({ state: 'detached' })
    assert(await toggle.evaluate(button => button === document.activeElement))
    await toggle.click()
    await overlay.waitFor()
    await page.getByRole('button', { name: 'AI Chat', exact: true }).click()
    await overlay.waitFor({ state: 'detached' })
    assert.equal(await sidebar.getAttribute('data-user-collapsed'), 'false')
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await sidebar.locator(':scope[data-collapsed="false"]').waitFor()
  await page.locator('html').evaluate(element => element.classList.add('dark'))
  await snapshot('desktop-chat-dark')
  assert.deepEqual(errors, [])
  console.log('Header toggle: desktop persistence, 900/899/800/480px layouts, overlay close, Escape focus, and navigation passed.')
} finally {
  await browser.close()
}
