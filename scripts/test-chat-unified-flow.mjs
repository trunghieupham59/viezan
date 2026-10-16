import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const url = process.env.VIEZAN_PREVIEW_URL ?? 'http://127.0.0.1:5174'
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname))
const output = process.env.VIEZAN_PICKER_SCREENSHOT_DIR
if (output) await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-proxy-server'] })
try {
  for (const width of [1440, 480, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(url)
    assert.equal(await page.locator('html').getAttribute('data-runtime'), 'web-preview')
    await page.locator('.chat-page').waitFor()
    await page.evaluate(async () => {
      // Reuse the renderer's exact module URL, including Vite's HMR timestamp.
      // Importing the bare path after a source edit can create a second store.
      const storeUrl = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/src/store/useAppStore.ts'))?.name
      if (!storeUrl) throw new Error('Renderer store module was not loaded')
      const { useAppStore } = await import(storeUrl)
      window.qaStore = useAppStore
      useAppStore.setState({ locale: 'vi', selectedProvider: 'gemini', selectedModels: { ...useAppStore.getState().selectedModels, gemini: 'gemini-2.0-flash' }, keyStatus: { gemini: true, openai: true, claude: true, local: true }, chatSessions: [], activeChatSessionId: null, chatPendingDraft: '', chatPendingTaskState: null })
      window.qa = { calls: [], searches: 0, listeners: new Map(), resolve: null, providerChanges: [] }
      useAppStore.subscribe((state, previous) => {
        if (state.selectedProvider !== previous.selectedProvider) window.qa.providerChanges.push({ provider: state.selectedProvider, trace: new Error().stack })
      })
      window.api.webSearch = async () => { window.qa.searches++; throw new Error('Unexpected search') }
      window.api.chat = async (payload) => { window.qa.calls.push(payload); return new Promise((resolve) => { window.qa.resolve = resolve }) }
      window.api.chatStream = window.api.chat
      window.api.onChatStreamEvent = (id, callback) => { window.qa.listeners.set(id, callback); return () => window.qa.listeners.delete(id) }
      window.api.chatStreamCancel = async () => ({ success: true })
    })
    const task = page.getByRole('button', { name: /^Tác vụ:/ })
    async function choose(label) {
      await task.click()
      const panel = page.getByRole('dialog', { name: 'Tác vụ', exact: true })
      assert.equal(await panel.getByRole('option').count(), 6)
      await panel.getByRole('option', { name: label, exact: true }).click()
    }
    async function shot(state) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false, `Horizontal overflow ${width}/${state}`)
      if (output) await page.screenshot({ path: path.join(output, `unified-${width}-${state}.png`), animations: 'disabled' })
    }
    assert.equal(await page.getByRole('button', { name: 'Tiêu chuẩn', exact: true }).count(), 0)
    await choose('Nghiên cứu')
    assert.equal(await page.getByRole('button', { name: 'Nguồn web', exact: true }).count(), 1)
    await page.getByRole('button', { name: 'Nguồn web', exact: true }).click()
    await page.getByRole('button', { name: /^Mức nghiên cứu:/ }).click()
    await page.getByRole('option', { name: 'Chuyên sâu', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'Nguồn web', exact: true }).count(), 0)
    await shot('research')
    await choose('Giải thích')
    assert.equal(await page.getByRole('button', { name: 'Nguồn web', exact: true }).getAttribute('aria-pressed'), 'true')
    await choose('Viết lách')
    await shot('writing')
    assert.equal(await page.evaluate(() => window.qaStore.getState().selectedProvider), 'gemini', JSON.stringify(await page.evaluate(() => window.qa.providerChanges)))
    await choose('Tạo ảnh')
    assert.equal(await page.getByRole('button', { name: 'Nguồn web', exact: true }).count(), 0)
    await shot('image')
    await choose('Dịch')
    await page.getByRole('button', { name: /^Ngôn ngữ đích:/ }).click()
    await page.getByRole('option', { name: 'Tiếng Trung (Giản thể)', exact: true }).click()
    const input = page.locator('.chat-input-field')
    await input.fill('Chào buổi sáng')
    await shot('before')
    // Sending through Enter while the task popover is open must close it immediately.
    await task.click()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option')
    await input.focus()
    await input.press('Enter')
    await page.waitForFunction(() => window.qa.calls.length === 1)
    assert.equal(await page.getByRole('dialog', { name: 'Tác vụ', exact: true }).count(), 0)
    const payload = await page.evaluate(() => window.qa.calls[0])
    assert.match(JSON.stringify(payload), /Chào buổi sáng/)
    assert.match(JSON.stringify(payload), /Tiếng Trung/)
    assert.equal(await page.evaluate(() => window.qa.searches), 0)
    await shot('sending')
    const thinking = page.locator('.thinking-state-pill')
    assert(await thinking.evaluate((el) => el.getBoundingClientRect().right <= innerWidth), 'Sending status must fit compact widths')
    assert(await thinking.locator('.truncate').evaluate((el) => el.getBoundingClientRect().height <= el.parentElement.getBoundingClientRect().height), 'Sending status must not wrap outside its pill')
    await page.evaluate(() => window.qa.resolve({ success: false, error: 'QA simulated error' }))
    await page.getByText('QA simulated error', { exact: true }).waitFor()
    await shot('error')
    // Change next-turn settings; retry must still use the original translation snapshot.
    await choose('Chat')
    await input.fill('Bản nháp chưa gửi')
    await page.getByRole('button', { name: 'Tạo lại phản hồi', exact: true }).click()
    await page.waitForFunction(() => window.qa.calls.length === 2)
    const retried = await page.evaluate(() => window.qa.calls[1])
    assert.deepEqual(retried.messages, payload.messages)
    assert.equal(retried.provider, payload.provider)
    assert.equal(retried.model, payload.model)
    await page.getByRole('button', { name: 'Dừng', exact: true }).click()
    await page.evaluate(() => window.qa.resolve({ success: true, reply: 'Late result must be ignored' }))
    await page.getByRole('button', { name: 'Tạo lại phản hồi', exact: true }).waitFor()
    assert.equal(await page.getByText('Late result must be ignored', { exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Tạo lại phản hồi', exact: true }).click()
    await page.waitForFunction(() => window.qa.calls.length === 3)
    await page.evaluate(() => window.qa.resolve({ success: true, reply: '早上好' }))
    await page.getByText('早上好', { exact: true }).waitFor()
    assert.equal(await input.inputValue(), 'Bản nháp chưa gửi')
    await shot('answered')
    const state = await page.evaluate(async () => {
      const useAppStore = window.qaStore
      const store = useAppStore.getState()
      const original = store.activeChatSessionId
      const other = store.createChatSession('claude', 'claude-sonnet-4-6')
      store.setChatTaskState(other, { selected: 3, options: { 3: 'email' }, applied: null, open: false, unified: true })
      store.setActiveChatSession(original)
      return { original, other }
    })
    assert.match(await task.getAttribute('aria-label'), /Chat/)
    await page.evaluate(async (state) => {
      const useAppStore = window.qaStore
      useAppStore.getState().setActiveChatSession(state.other)
    }, state)
    await page.waitForFunction(() => document.querySelector('.chat-task-trigger-label')?.textContent === 'Viết lách')
    await task.click()
    const imageOption = page.getByRole('option', { name: 'Tạo ảnh', exact: true })
    assert.equal(await imageOption.isDisabled(), true)
    assert(await imageOption.locator('.language-picker-option-label').evaluate((el) => el.scrollWidth <= el.clientWidth), 'Image task label must remain readable')
    await shot('unsupported-image')
    if (output) await writeFile(path.join(output, `unified-${width}-payload.json`), JSON.stringify({ original: payload, retry: retried }, null, 2))
    console.log(`PASS unified ${width}: six tasks, depth/source policy, image support, send/popover, payload, error/cancel/retry, session state and draft`)
    await page.close()
  }
} finally {
  await browser.close()
}
