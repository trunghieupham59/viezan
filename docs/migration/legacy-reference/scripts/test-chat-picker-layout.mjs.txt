import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const url = process.env.VIEZAN_PREVIEW_URL ?? 'http://127.0.0.1:5174'
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Use a local web preview')
const output = process.env.VIEZAN_PICKER_SCREENSHOT_DIR
if (output) await mkdir(output, { recursive: true })
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-proxy-server'] })

async function checkGeometry(page, panel, anchor) {
  // A short menu must touch its trigger by the token gap, not reserve its max height.
  let result
  for (let attempt = 0; attempt < 30; attempt += 1) {
    result = await panel.evaluate((element, anchorElement) => {
      const box = element.getBoundingClientRect()
      const trigger = anchorElement.getBoundingClientRect()
      const expectedGap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vzn-space-1-5'))
      const above = element.classList.contains('language-picker-panel--above')
      const gap = above ? trigger.top - box.bottom : box.top - trigger.bottom
      return { gap, expectedGap, inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight }
    }, await anchor.elementHandle())
    if (result.inside && Math.abs(result.gap - result.expectedGap) <= 1) return
    await page.waitForTimeout(50)
  }
  assert.fail(`Menu must stay next to its trigger and inside viewport: ${JSON.stringify(result)}`)
}

async function snapshot(page, name) {
  if (output) await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' })
}

try {
  for (const [width, height] of [[1768, 1030], [1440, 900], [800, 900], [480, 900], [360, 640]]) {
    for (const active of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height }, locale: 'vi-VN' })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(url)
      assert.equal(await page.locator('html').getAttribute('data-runtime'), 'web-preview', 'Only deterministic web preview is supported')
      await page.locator('.chat-page').waitFor()
      await page.evaluate(async (active) => {
        const storeUrl = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/store/useAppStore.ts'))?.name
        if (!storeUrl) throw new Error('Renderer store module was not loaded')
        const { useAppStore } = await import(storeUrl)
        const taskState = { selected: 0, options: { 0: 'vi' }, applied: null, open: false }
        const messages = [
          { id: 'qa-user', role: 'user', content: [{ type: 'text', text: 'Sample input' }], timestamp: 1 },
          { id: 'qa-answer', role: 'assistant', content: [{ type: 'text', text: 'Sample answer for layout verification.' }], timestamp: 2 },
        ]
        useAppStore.setState({ locale: 'vi', selectedProvider: 'local', keyStatus: { local: true, gemini: false, claude: false, openai: false },
          chatSessions: active ? [{ id: 'picker-qa', title: 'Picker layout QA', provider: 'local', model: 'local-auto', messages, taskState, createdAt: 1, updatedAt: 2 }] : [],
          activeChatSessionId: active ? 'picker-qa' : null, chatPendingTaskState: active ? null : taskState, chatPendingDraft: '' })
      }, active)
      const prefix = `picker-${width}-${active ? 'active' : 'empty'}`
      const taskTrigger = page.getByRole('button', { name: /^Tác vụ:/ })
      await taskTrigger.click()
      const taskPanel = page.getByRole('dialog', { name: 'Tác vụ', exact: true })
      await checkGeometry(page, taskPanel, taskTrigger)
      await snapshot(page, `${prefix}-tasks`)
      await page.keyboard.press('Escape')

      const languageTrigger = page.getByRole('button', { name: /^Ngôn ngữ đích:/ })
      await languageTrigger.click()
      const languagePanel = page.getByRole('dialog', { name: 'Ngôn ngữ đích', exact: true })
      await checkGeometry(page, languagePanel, languageTrigger)
      for (const label of ['Tiếng Trung (Giản thể)', 'Tiếng Trung (Phồn thể)']) {
        const text = languagePanel.getByText(label, { exact: true })
        assert(await text.evaluate((element) => element.scrollWidth <= element.clientWidth), `${label} is truncated at ${width}px`)
      }
      await snapshot(page, `${prefix}-languages`)
      const initialSide = await languagePanel.getAttribute('class')
      await languagePanel.getByRole('searchbox').fill('Trung')
      await checkGeometry(page, languagePanel, languageTrigger)
      assert.equal(await languagePanel.getAttribute('class'), initialSide, 'Filtering must not flip the menu to the other side')
      await languagePanel.getByRole('option', { name: 'Tiếng Trung (Giản thể)', exact: true }).click()
      assert.equal(await languageTrigger.getAttribute('aria-expanded'), 'false')
      assert.deepEqual(errors, [])
      console.log(`PASS ${prefix}: menu gap, viewport bounds, full Chinese labels, search and selection`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
