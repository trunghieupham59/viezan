import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

// Isolated web-preview data: no microphone, provider requests or installed app.
const url = 'http://127.0.0.1:5199'
const output = mkdtempSync(path.join(os.tmpdir(), 'viezan-minimum-'))
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'web-preview', '--host', '127.0.0.1', '--port', '5199', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let browser
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Dedicated preview port is unavailable')
    try { if ((await fetch(url)).ok) break } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) })
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.locator('.app-shell').waitFor()
  // Regression: short-window dictionary remains usable after context resizing.
  for (const width of [640, 1200]) {
    await page.setViewportSize({ width, height: width === 640 ? 480 : 700 })
    await page.evaluate(async () => {
      const { useAppStore } = await import('/src/store/useAppStore.ts')
      useAppStore.setState({ locale: 'vi', localeAuto: false, activePage: 'dictionary', settingsOpen: false })
    })
    const contextToggle = page.locator('.dictionary-context-row button')
    if (await contextToggle.getAttribute('aria-expanded') !== 'true') await contextToggle.click()
    await page.locator('.dictionary-context-field').evaluate(e => { e.style.height = '240px' })
    assert(await page.locator('.dictionary-context-field').evaluate(e => e.clientHeight < 150), 'Context resize not capped')
    const result = page.locator('.dictionary-result-region')
    await result.scrollIntoViewIfNeeded()
    assert(await result.evaluate(e => {
      const r = e.getBoundingClientRect()
      return r.height >= 200 && r.top >= 0 && r.bottom <= innerHeight
    }), 'Dictionary result not reachable')
    await page.screenshot({ path: path.join(output, `dictionary-context-${width}.png`) })
    await page.evaluate(async () => {
      const { useAppStore } = await import('/src/store/useAppStore.ts')
      useAppStore.setState({ settingsOpen: true })
    })
    await page.locator('[data-settings-section="updates"]').evaluate(e => e.scrollIntoView({ block: 'start', behavior: 'instant' }))
    await page.waitForTimeout(500)
    if (width === 640) {
      assert(await page.locator('nav [aria-current="true"]').evaluateAll(items => items.filter(e => e.getBoundingClientRect().height).every(e => {
        const r = e.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth
      })), 'Active settings tab outside viewport')
    }
    await page.screenshot({ path: path.join(output, `settings-navigation-${width}.png`) })
    await page.evaluate(async () => {
      const { useAppStore } = await import('/src/store/useAppStore.ts')
      useAppStore.setState({ settingsOpen: false, activePage: 'live' })
    })
    await page.locator('.live-notification-viewport').waitFor()
    assert(await page.locator('.live-notification-viewport').evaluate(e => {
      const toolbar = document.querySelector('.feature-command-bar').getBoundingClientRect()
      return e.getBoundingClientRect().top >= toolbar.bottom
    }), 'Live notice covers toolbar')
    await page.screenshot({ path: path.join(output, `live-notice-${width}.png`) })

  }
  await page.setViewportSize({ width: 640, height: 480 })
  for (const locale of ['vi', 'en', 'ja']) {
    for (const theme of ['light', 'dark']) {
      for (const screen of ['chat', 'translate', 'live', 'settings']) {
        await page.evaluate(async ({ locale, theme, screen }) => {
          const { useAppStore } = await import('/src/store/useAppStore.ts')
          useAppStore.setState({ locale, localeAuto: false, theme, activePage: screen === 'settings' ? 'chat' : screen,
            settingsOpen: screen === 'settings', autoTranslate: false,
            sourceText: 'Layout verification source.', translatedText: 'Layout verification result.' })
        }, { locale, theme, screen })
        await page.locator({ chat: '.chat-page-composer', translate: '.translate-workbench', live: '.live-panels-body', settings: '.settings-shell' }[screen]).waitFor()
        await page.waitForTimeout(200)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${screen}: page overflow`)
        if (screen === 'translate') {
          const result = page.locator('.translate-result-pane')
          await result.scrollIntoViewIfNeeded()
          const reachable = await result.evaluate(e => {
            const r = e.getBoundingClientRect()
            const workbench = e.closest('.translate-workbench').getBoundingClientRect()
            return r.bottom <= innerHeight + 1 && r.bottom <= workbench.bottom + 1
          })
          assert(reachable, 'Translation result/footer clipped by workbench')
        }
        if (screen === 'live') {
          const toast = page.locator('.notification-toast').first()
          if (await toast.count()) {
            assert(await toast.evaluate(e => {
              const r = e.getBoundingClientRect()
              const toolbar = document.querySelector('.feature-command-bar').getBoundingClientRect()
              return r.left >= 60 && r.right <= innerWidth && r.top >= toolbar.bottom
            }), 'Live toast escapes the content area')
          }
          const panels = page.locator('.live-panels-body .glass-panel')
          assert.equal(await panels.count(), 2)
          for (const panel of await panels.all()) {
            await panel.scrollIntoViewIfNeeded()
            assert(await panel.evaluate(e => e.querySelector('.live-scroll-viewport').clientHeight >= 100), 'Live transcript compressed below readable height')
          }
        }
        if (screen === 'settings') {
          for (const row of await page.locator('.settings-choice-row').all()) {
            await row.scrollIntoViewIfNeeded()
            assert(await row.evaluate(e => e.scrollWidth <= e.clientWidth), 'Settings choices overflow')
          }
        }
        if (screen === 'chat') {
          assert(await page.locator('.chat-page-composer').evaluate(e => {
            const r = e.getBoundingClientRect()
            return r.top >= 40 && r.bottom <= innerHeight && r.right <= innerWidth
          }), 'Chat composer outside viewport')
        }
        await page.screenshot({ path: path.join(output, `${screen}-${locale}-${theme}.png`) })
        if (screen === 'translate' || screen === 'live') {
          if (screen === 'live') {
            for (const close of await page.locator('.notification-toast button[aria-label]').all()) await close.click()
          }
          const trigger = screen === 'translate' ? page.locator('.translate-options-trigger') : page.locator('.feature-command-bar .ai-configuration-anchor > button')
          await trigger.click()
          const dialog = page.locator('.ai-configuration-popover')
          await dialog.waitFor()
          assert(await dialog.evaluate(e => {
            const r = e.getBoundingClientRect()
            return r.top >= 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1
          }), `${screen}: AI configuration outside viewport`)
          await page.screenshot({ path: path.join(output, `${screen}-config-${locale}-${theme}.png`) })
          await page.keyboard.press('Escape')
        }
      }
    }
  }
  // Resizing must never persist an automatic sidebar decision.
  for (const collapsed of [false, true]) {
    await page.evaluate(async collapsed => {
      const { useAppStore } = await import('/src/store/useAppStore.ts')
      useAppStore.setState({ activePage: 'chat', settingsOpen: false, sidebarCollapsed: collapsed, aiChatSidebarCollapsed: collapsed })
    }, collapsed)
    for (const width of [1200, 900, 640, 1200]) {
      await page.setViewportSize({ width, height: 480 })
      await page.waitForTimeout(100)
      const stored = await page.evaluate(async () => {
        const { useAppStore } = await import('/src/store/useAppStore.ts')
        const s = useAppStore.getState()
        return [s.sidebarCollapsed, s.aiChatSidebarCollapsed]
      })
      assert.deepEqual(stored, [collapsed, collapsed])
    }
  }
  assert.deepEqual(errors, [])
  console.log(`PASS: 640x480, four screens, EN/VI/JA, light/dark, reachable translation/live panels, sidebar preferences. Screenshots: ${output}`)
} finally {
  await browser?.close()
  server.kill()
}
