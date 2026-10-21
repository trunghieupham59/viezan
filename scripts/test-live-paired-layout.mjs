import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const output = mkdtempSync(path.join(os.tmpdir(), 'viezan-paired-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'web-preview', '--port', '5199', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let browser
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Preview port unavailable')
    try { if ((await fetch('http://localhost:5199')).ok) break } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  const page = await browser.newPage()
  for (const width of [640, 1200]) {
    for (const mode of ['paired', 'split']) {
    await page.setViewportSize({ width, height: width === 640 ? 480 : 700 })
    await page.goto('http://localhost:5199')
    await page.locator('.app-shell').waitFor()
    await page.evaluate(async () => {
      const { useAppStore } = await import('/src/store/useAppStore.ts')
      useAppStore.setState({ locale: 'vi', localeAuto: false, activePage: 'live' })
    })
    await page.getByRole('button', { name: mode === 'paired' ? 'Theo câu' : 'Song song', exact: true }).click()
    for (const close of await page.locator('.notification-toast button[aria-label]').all()) await close.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(output, `empty-${mode}-${width}.png`) })
    // Layout fixtures only: exercise the real scroll element and ResizeObserver hook,
    // without opening microphones or sending audio to a provider.
    const panels = page.locator(mode === 'paired' ? '.live-paired-panel' : '.live-panels-body .app-panel-grid > .glass-panel')
    for (const panel of await panels.all()) {
    await panel.scrollIntoViewIfNeeded()
    const originalHeight = await panel.evaluate(el => el.clientHeight)
    const content = panel.locator('.live-scroll-content')
    const appendRows = async count => content.evaluate((el, count) => {
      for (let i = 0; i < count; i++) {
        const row = document.createElement('p')
        row.textContent = `${i + 1}. Nội dung gốc và bản dịch kiểm tra cuộn. Original speech and translated sentence.`
        el.append(row)
      }
    }, count)
    const viewport = panel.locator('.live-scroll-viewport')
    const atBottom = () => viewport.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight < 3)
    await appendRows(40)
    await page.waitForTimeout(250)
    assert(await atBottom(), 'New content must follow the latest sentence')
    assert(await viewport.evaluate(el => el.scrollHeight > el.clientHeight), 'Transcript must scroll internally')
    assert.equal(await panel.evaluate(el => el.clientHeight), originalHeight, 'Panel grew with transcript content')
    await viewport.evaluate(el => { el.scrollTop = 0 })
    await page.waitForTimeout(150)
    await appendRows(5)
    await page.waitForTimeout(250)
    assert(await viewport.evaluate(el => el.scrollTop === 0), 'New content must not interrupt reading earlier sentences')
    await panel.locator('.live-jump-latest').click()
    assert(await atBottom(), 'Jump to latest failed')
    }
    await page.screenshot({ path: path.join(output, `long-${mode}-${width}.png`) })
    }
  }
  await page.setViewportSize({ width: 1200, height: 700 })
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.setState({ settingsOpen: true })
  })
  await page.locator('[data-settings-section="updates"]').evaluate(el => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await page.waitForTimeout(500)
  for (const width of [640, 1200, 640]) {
    await page.setViewportSize({ width, height: width === 640 ? 480 : 700 })
    await page.waitForTimeout(500)
    assert(await page.locator('nav [aria-current="true"]').evaluateAll(items => items.filter(el => el.getBoundingClientRect().height > 0).every(el => {
      const rect = el.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth
    })), 'Active settings tab hidden after resize')
  }
  await page.screenshot({ path: path.join(output, 'settings-resize.png') })
  console.log(`PASS paired/split layout and settings resize, follow latest, reading earlier content, jump to latest at 640x480 and 1200x700. Screenshots: ${output}`)
} finally {
  await browser?.close()
  server.kill()
}
