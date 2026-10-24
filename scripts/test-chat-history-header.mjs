import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const url = process.argv[2]
assert(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
const output = process.argv[3]
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
try {
  for (const width of [1440, 900, 899, 800, 480, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.goto(url)
      await page.locator('.chat-page').waitFor()
      await page.evaluate(async () => {
        const storeUrl = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/store/useAppStore.ts'))?.name
        const { useAppStore } = await import(storeUrl)
        window.qaStore = useAppStore
        useAppStore.setState({ locale: 'vi', sidebarCollapsed: true, aiChatSidebarCollapsed: true })
      })
      const toggle = page.locator('.ai-chat-history-toggle')
      const sidebar = page.locator('.ai-chat-sidebar')
      const newChat = page.locator('.ai-chat-header-new')
      await page.waitForTimeout(300)
      const original = await toggle.boundingBox()
      const originalNew = await newChat.boundingBox()
      for (const expanded of [true, false, true]) {
        await toggle.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), String(expanded))
        await page.waitForTimeout(300)
        const current = await toggle.boundingBox()
        const currentNew = await newChat.boundingBox()
        for (const axis of ['x', 'y']) {
          assert(Math.abs(current[axis] - original[axis]) < 1, `History moved on ${axis} at ${width}px`)
          assert(Math.abs(currentNew[axis] - originalNew[axis]) < 1, `New Chat moved on ${axis} at ${width}px`)
        }
        assert.equal(await sidebar.isVisible(), expanded)
        assert(currentNew.x + currentNew.width <= width)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        if (expanded) {
          const header = await page.locator('.ai-chat-workspace-header').boundingBox()
          const panel = await sidebar.boundingBox()
          if (width >= 900) {
            // The history column runs the full height beside the header-over-conversation column.
            assert(Math.abs(panel.y - header.y) < 1, 'History must start level with the feature header')
            assert(panel.x + panel.width <= header.x + 1, 'History must sit beside the feature header')
          } else {
            // Compact: a temporary overlay below the header, so its toggle stays reachable.
            assert(panel.y >= header.y + header.height - 1, 'History overlay covers the header')
          }
        }
        if (output) await page.screenshot({ path: path.join(output, `${width}-${expanded ? 'open' : 'closed'}.png`), animations: 'disabled' })
      }
      if (width < 900) {
        await page.keyboard.press('Escape')
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        assert(await toggle.evaluate(el => el === document.activeElement))
        assert.equal(await page.evaluate(() => window.qaStore.getState().aiChatSidebarCollapsed), true)
        await toggle.click()
        await newChat.click()
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
      }
      console.log(`History fixed header passed: ${width}px`)
    } finally { await page.close() }
  }
} finally { await browser.close() }
