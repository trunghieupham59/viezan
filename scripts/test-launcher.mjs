import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { chromium } from 'playwright'

// Dedicated, loopback-only preview; never attach to or restart a desktop runtime.
const port = Number(process.env.VIEZAN_LAUNCHER_TEST_PORT || 5188)
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, 'Invalid test port')
await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(port, '127.0.0.1', () => probe.close(resolve))
})
const output = path.resolve(process.env.VIEZAN_LAUNCHER_QA_DIR || '.git/codex-task-state/launcher-qa')
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', '--mode', 'web-preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
], { windowsHide: true, stdio: 'ignore' })
const url = `http://127.0.0.1:${port}/quick-chat.html`
let browser
try {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    try { ready = (await fetch(url)).ok } catch { /* server starting */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(ready, 'Launcher preview did not start')
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  })
  const page = await browser.newPage({ viewport: { width: 860, height: 540 }, locale: 'en-US' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (!localStorage.getItem('translate-app-settings')) localStorage.setItem('translate-app-settings', JSON.stringify({
      version: 0,
      state: { locale: 'en', localeAuto: false, selectedProvider: 'local', selectedModels: { local: 'local-auto' }, chatSendShortcut: 'enter', theme: 'light' },
    }))
  })
  await page.goto(url)
  await page.getByRole('option', { name: 'Calculator (preview) Application' }).waitFor()
  assert(await page.getByRole('combobox').evaluate(element => document.activeElement === element), 'Search not focused')
  for (const width of [860, 420]) {
    await page.setViewportSize({ width, height: 540 })
    await page.screenshot({ path: path.join(output, `launcher-${width}.png`) })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
  }
  const search = page.getByRole('combobox')
  await search.fill('calc')
  await search.press('Enter')
  await page.getByRole('alert').waitFor()
  await search.fill('Explain this draft')
  await search.press('Control+Enter')
  const composer = page.getByRole('textbox')
  await page.getByText('This is a streamed Web Preview response.', { exact: true }).waitFor()
  assert.equal(await composer.inputValue(), '', 'Ask AI should send the query immediately')
  await page.screenshot({ path: path.join(output, 'launcher-chat-420.png') })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Chat horizontal overflow')
  await page.setViewportSize({ width: 860, height: 540 })
  await page.screenshot({ path: path.join(output, 'launcher-chat.png') })
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('combobox').fill('')
  await page.getByRole('combobox').press('Control+Enter')
  await page.getByText('This is a streamed Web Preview response.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('combobox').fill('')
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: path.join(output, 'launcher-dark.png') })
  for (const locale of ['vi', 'ja']) {
    await page.evaluate(locale => {
      const settings = JSON.parse(localStorage.getItem('translate-app-settings'))
      settings.state.locale = locale
      localStorage.setItem('translate-app-settings', JSON.stringify(settings))
    }, locale)
    await page.reload()
    await page.setViewportSize({ width: 420, height: 540 })
    await page.getByRole('option').first().waitFor()
    await page.screenshot({ path: path.join(output, `launcher-${locale}-420.png`) })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale} horizontal overflow`)
  }
  assert.deepEqual(errors, [], 'Renderer errors')
  console.log(`Launcher visual checks passed at 860px/420px, light/dark, search/error/chat states. Screenshots: ${output}`)
} finally {
  await browser?.close()
  server.kill()
}
