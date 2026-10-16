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
  for (const platform of ['win32', 'darwin']) {
    for (const width of [1440, 800, 480, 360]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        await page.goto(url)
        await page.locator('.ai-chat-header-new').waitFor()
        await page.locator('.chat-page').waitFor()
        await page.evaluate(async platform => {
          const storeUrl = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/store/useAppStore.ts'))?.name
          const { useAppStore } = await import(storeUrl)
          window.qaStore = useAppStore
          window.api.platform = platform
          useAppStore.setState({ locale: 'vi', chatNewSessionShortcut: 'CommandOrControl+N', activePage: 'chat' })
        }, platform)
        const button = page.locator('.ai-chat-header-new')
        const shortcut = platform === 'darwin' ? 'Cmd+N' : 'Ctrl+N'
        await page.waitForFunction(label => document.querySelector('.ai-chat-header-new kbd')?.textContent === label, shortcut)
        assert((await button.getAttribute('title')).includes(shortcut))
        const bounds = await button.boundingBox()
        assert(bounds.x >= 0 && bounds.x + bounds.width <= width)
        assert.equal(await button.evaluate(el => el.scrollWidth > el.clientWidth), false)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await page.evaluate(() => {
          const state = window.qaStore.getState()
          state.setActiveChatSession(state.createChatSession('local', 'local-auto'))
        })
        await page.waitForFunction(() => {
          const state = window.qaStore.getState()
          return document.querySelector('.ai-chat-workspace-title')?.textContent === state.chatSessions.find(s => s.id === state.activeChatSessionId)?.title
        })
        await page.locator('.chat-composer textarea').focus()
        await page.keyboard.press(platform === 'darwin' ? 'Meta+n' : 'Control+n')
        await page.waitForFunction(() => window.qaStore.getState().activeChatSessionId === null)
        await page.evaluate(() => {
          const state = window.qaStore.getState()
          state.setActiveChatSession(state.createChatSession('local', 'local-auto'))
        })
        await button.click()
        await page.waitForFunction(() => window.qaStore.getState().activeChatSessionId === null)
        if (output) await page.screenshot({ path: path.join(output, `${platform}-${width}.png`), animations: 'disabled' })
        console.log(`New Chat header passed: ${platform}, ${width}px, ${shortcut}`)
      } finally { await page.close() }
    }
  }
} finally { await browser.close() }
