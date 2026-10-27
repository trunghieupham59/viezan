import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// Dedicated preview server; native download/install are simulated here.
const url = 'http://127.0.0.1:5174'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'web-preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { stdio: 'inherit' })
const output = process.env.VIEZAN_UPDATE_QA_DIR
if (output) mkdirSync(output, { recursive: true })
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
let browser
const assert = (value, message) => { if (!value) throw new Error(message) }
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error('QA preview server exited before startup')
    try { ready = (await fetch(url)).ok } catch { /* Server is starting. */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(ready, 'QA preview server did not start')
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
  const page = await browser.newPage({ locale: 'en-US' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.locator('.app-shell').waitFor()
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 800 })
    for (const theme of ['light', 'dark']) {
      for (const locale of ['en', 'vi', 'ja']) {
        await page.evaluate(async ({ theme, locale }) => {
          const { useAppStore } = await import('/src/store/useAppStore.ts')
          const { useUpdaterStore } = await import('/src/store/useUpdaterStore.ts')
          useAppStore.setState({ theme, locale, localeAuto: false, settingsOpen: false })
          useUpdaterStore.setState({ snoozes: {}, status: { type: 'available', version: '3.0.0', background: true } })
        }, { theme, locale })
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        const layout = await dialog.evaluate(element => {
          const bounds = element.getBoundingClientRect()
          return {
            fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight,
            overflow: element.scrollWidth > element.clientWidth,
            sizes: [...element.querySelectorAll('button')].map(button => Math.round(button.getBoundingClientRect().height)),
          }
        })
        assert(layout.fits && !layout.overflow, `Popup overflow at ${width}/${theme}/${locale}`)
        assert(layout.sizes.every(size => size === 36), `Button sizes differ at ${width}/${theme}/${locale}`)
        if (output) await page.screenshot({ path: path.join(output, `update-${width}-${theme}-${locale}.png`) })
      }
    }
  }

  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.setState({ locale: 'en', theme: 'light' })
  })
  await page.getByRole('button', { name: 'Remind me later' }).click()
  assert(await page.getByRole('dialog').count() === 0, 'Snooze did not close popup')
  await page.reload()
  await page.locator('.app-shell').waitFor()
  await page.evaluate(async () => {
    const { useUpdaterStore } = await import('/src/store/useUpdaterStore.ts')
    useUpdaterStore.getState().receive({ type: 'available', version: '3.0.0', background: true })
  })
  assert(await page.getByRole('dialog').count() === 0, 'Snooze did not survive reload')

  await page.evaluate(async () => {
    const { useUpdaterStore } = await import('/src/store/useUpdaterStore.ts')
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.setState({ locale: 'en', localeAuto: false })
    const receive = useUpdaterStore.getState().receive
    window.api.updater.download = async () => { receive({ type: 'downloading', percent: 42 }); return { success: true } }
    window.api.updater.install = async () => ({ success: true })
    receive({ type: 'available', version: '3.1.0' })
  })
  await page.getByRole('button', { name: 'Download Update' }).click()
  await page.getByRole('status').filter({ hasText: '42%' }).waitFor()
  if (output) await page.screenshot({ path: path.join(output, 'update-downloading.png') })
  await page.evaluate(async () => {
    const { useUpdaterStore } = await import('/src/store/useUpdaterStore.ts')
    useUpdaterStore.getState().receive({ type: 'downloaded', version: '3.1.0' })
  })
  await page.getByRole('button', { name: 'Install & Restart' }).waitFor()
  if (output) await page.screenshot({ path: path.join(output, 'update-ready.png') })
  await page.keyboard.press('Escape')
  assert(await page.getByRole('dialog').count() === 0, 'Escape did not snooze popup')
  // Native mode keeps status in Settings and suppresses the renderer modal.
  await page.evaluate(async () => {
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    const { useUpdaterStore } = await import('/src/store/useUpdaterStore.ts')
    let preferences = { enabled: true, locale: 'en', theme: 'light' }
    window.api.updater.getNotificationPreferences = async () => preferences
    window.api.updater.setNotificationPreferences = async patch => (preferences = { ...preferences, ...patch })
    useAppStore.setState({ settingsOpen: true, settingsInitialSection: 'updates' })
    useUpdaterStore.getState().receive({ type: 'available', version: '3.2.0' })
  })
  const notificationToggle = page.getByRole('switch', { name: 'Floating update notifications' })
  await notificationToggle.waitFor()
  assert(await page.locator('.update-notification').count() === 0, 'Native mode duplicated the popup in the renderer')
  await notificationToggle.click()
  assert(await notificationToggle.getAttribute('aria-checked') === 'false', 'Notification preference was not disabled')
  await notificationToggle.click()
  assert(await notificationToggle.getAttribute('aria-checked') === 'true', 'Notification preference was not enabled')
  if (output) await page.screenshot({ path: path.join(output, 'update-settings-toggle.png') })
  assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`)
  console.log('Update popup QA passed: 12 width/theme/locale combinations, progress, ready, Escape, snooze across reload; native actions simulated.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
