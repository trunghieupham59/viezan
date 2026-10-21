import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright'

// Windows integration against the actual updater, production IPC/preloads and
// tray code. Only the feed is local and installer execution is intercepted.
// The .exe fixture is plain text, never an executable or a real release asset.
assert.equal(process.platform, 'win32', 'This integration exercises the Windows NSIS path')
const output = mkdtempSync(path.join(os.tmpdir(), 'viezan-updater-integration-'))
let version = '3.0.0'
let corrupt = false
let metadataRequests = 0
let downloads = 0
const payload = Buffer.alloc(512 * 1024, 'Viezan updater QA fixture. Not an executable.\n')
const checksum = createHash('sha512').update(payload).digest('base64')
const server = createServer((request, response) => {
  if (request.url.startsWith('/latest.yml')) {
    metadataRequests++
    response.end(`version: ${version}\nfiles:\n  - url: fixture-${version}.exe\n    sha512: ${checksum}\n    size: ${payload.length}\npath: fixture-${version}.exe\nsha512: ${checksum}\nreleaseDate: 2026-10-21T00:00:00.000Z\n`)
    return
  }
  if (request.url.startsWith('/fixture-')) {
    downloads++
    const body = Buffer.from(payload)
    if (corrupt) body[0] ^= 1
    response.writeHead(200, { 'Content-Length': body.length, 'Content-Type': 'application/octet-stream' })
    let offset = 0
    const timer = setInterval(() => {
      response.write(body.subarray(offset, offset + 16384))
      offset += 16384
      if (offset >= body.length) { clearInterval(timer); response.end() }
    }, 50)
    response.on('close', () => clearInterval(timer))
    return
  }
  response.writeHead(404).end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const feed = `http://127.0.0.1:${server.address().port}`
const harness = path.join(output, 'main.cjs')
const config = path.join(output, 'app-update.yml')
writeFileSync(config, `provider: generic\nurl: ${feed}\nupdaterCacheDirName: ${JSON.stringify(path.basename(output))}\n`)
const repo = process.cwd()
writeFileSync(harness, `
const { app, BrowserWindow, ipcMain } = require('electron')
app.setPath('userData', ${JSON.stringify(output)})
app.setName('Viezan Updater QA')
app.getVersion = () => '2.2.2'
Object.defineProperty(app, 'isPackaged', { value: true })
const { autoUpdater } = require(${JSON.stringify(path.join(repo, 'node_modules/electron-updater'))})
autoUpdater.updateConfigPath = ${JSON.stringify(config)}
autoUpdater.setFeedURL({ provider: 'generic', url: ${JSON.stringify(feed)} })
autoUpdater.disableDifferentialDownload = true
let installs = []
autoUpdater.quitAndInstall = (...args) => { installs.push(args) }
app.whenReady().then(async () => {
  const main = new BrowserWindow({ show: false, webPreferences: {
    preload: ${JSON.stringify(path.join(repo, 'dist-electron/preload.js'))},
    sandbox: true, nodeIntegration: false, contextIsolation: true,
  } })
  let updater
  const notify = require(${JSON.stringify(path.join(repo, 'dist-electron/updateNotification.js'))}).createUpdateNotification(ipcMain, () => main, () => main.show(), {
    download: () => updater.download(), install: () => updater.install(),
  })
  updater = require(${JSON.stringify(path.join(repo, 'dist-electron/ipc/updater.js'))}).registerUpdaterHandlers(ipcMain, () => main, notify)
  const tray = require(${JSON.stringify(path.join(repo, 'dist-electron/trayManager.js'))}).createAppTray({
    iconPath: ${JSON.stringify(path.join(repo, 'public/tray.ico'))}, osLocale: 'en', tooltip: 'Viezan Updater QA', onOpen: () => main.show(), onQuit: () => app.quit(),
  })
  app.on('before-quit', () => tray?.destroy())
  await main.loadURL('data:text/html,<title>Updater integration</title>')
  global.qa = { main, tray, installs }
})
`)
const env = { ...process.env, LOCALAPPDATA: output }
delete env.ELECTRON_RUN_AS_NODE
let app
let main
const popupVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(win => win.webContents.getURL().includes('update-notification.html') && win.isVisible()))
const popupPage = async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const page = app.windows().find(item => item.url().includes('update-notification.html'))
    if (page) { await page.getByRole('heading').waitFor(); return page }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Popup did not load')
}
const start = async () => {
  app = await electron.launch({ args: [harness], env })
  await app.evaluate(async () => { while (!global.qa) await new Promise(resolve => setTimeout(resolve, 20)) })
  main = app.windows().find(page => page.url().startsWith('data:'))
  assert.equal(await app.evaluate(() => !!global.qa.tray && !global.qa.main.isVisible()), true)
}
try {
  await start()
  await main.evaluate(() => { window.qaStatuses = []; window.api.updater.onStatus(status => window.qaStatuses.push(status)) })
  // Real 30-second startup timer, main hidden and actual tray present.
  await main.waitForFunction(() => window.qaStatuses.some(status => status.type === 'available' && status.background), null, { timeout: 45000 })
  assert.equal(metadataRequests, 1)
  assert.equal(downloads, 0)
  let popup = await popupPage()
  assert.equal(await popupVisible(), true)
  await main.evaluate(() => window.api.updater.setNotificationPreferences({ enabled: false }))
  assert.equal(await popupVisible(), false)
  await app.close()
  await start()
  assert.equal(await main.evaluate(() => window.api.updater.getNotificationPreferences().then(p => p.enabled)), false)
  await main.evaluate(() => window.api.updater.check())
  assert.equal(await popupVisible(), false)
  await main.evaluate(() => window.api.updater.setNotificationPreferences({ enabled: true }))
  popup = await popupPage()
  await popup.getByRole('button', { name: 'Remind in 24 hours' }).click()
  const saved = JSON.parse(readFileSync(path.join(output, 'update-notifications.json'), 'utf8'))
  assert(Math.abs(saved.snoozes['3.0.0'] - Date.now() - 86400000) < 5000)
  assert.equal(await popupVisible(), false)
  await app.close()
  await start()
  await main.evaluate(() => window.api.updater.check())
  assert.equal(await popupVisible(), false, 'Snooze did not survive process restart')
  await app.close()
  // Shorten only this QA data timestamp to test the real wake-up timer without
  // sleeping 24 hours. The persisted 24-hour duration was asserted above.
  saved.snoozes['3.0.0'] = Date.now() + 4000
  writeFileSync(path.join(output, 'update-notifications.json'), JSON.stringify(saved))
  await start()
  await main.evaluate(() => window.api.updater.check())
  assert.equal(await popupVisible(), false)
  popup = await popupPage()
  assert.equal(await popupVisible(), true, 'Reminder did not wake after the saved deadline')
  await popup.getByRole('button', { name: 'Remind in 24 hours' }).click()
  version = '3.1.0'
  await main.evaluate(() => window.api.updater.check())
  popup = await popupPage()
  assert.equal(await popupVisible(), true, 'A newer release must not inherit the previous version snooze')
  corrupt = true
  await popup.getByRole('button', { name: 'Download Update', exact: true }).click()
  await main.waitForFunction(async () => (await window.api.updater.getStatus())?.type === 'downloading')
  const checksBeforeDownload = metadataRequests
  await main.evaluate(() => { window.qaConcurrent = window.api.updater.download() })
  await main.evaluate(() => window.api.updater.check())
  assert.equal(metadataRequests, checksBeforeDownload, 'A check raced with the active download')
  await main.evaluate(() => window.api.updater.setNotificationPreferences({ enabled: false }))
  assert.equal(await popupVisible(), false)
  await main.waitForFunction(async () => !!(await window.api.updater.getStatus())?.error)
  assert.equal(await popupVisible(), false, 'A download error bypassed disabled notifications')
  await main.reload()
  assert.deepEqual(await main.evaluate(() => window.api.updater.getStatus().then(s => ({ type: s.type, version: s.version }))), { type: 'available', version: '3.1.0' })
  await main.evaluate(() => window.api.updater.setNotificationPreferences({ enabled: true }))
  await popup.getByRole('alert').waitFor()
  assert.equal(await popup.getByRole('button', { name: 'Download Update', exact: true }).isEnabled(), true)
  assert.equal(await app.evaluate(() => global.qa.installs.length), 0)
  corrupt = false
  await popup.getByRole('button', { name: 'Download Update', exact: true }).click()
  await popup.getByRole('button', { name: 'Install & Restart', exact: true }).waitFor()
  assert.equal(downloads, 2, 'The corrupt artifact must be discarded and downloaded again')
  assert.equal(await app.evaluate(() => global.qa.installs.length), 0)
  const status = await main.evaluate(() => window.api.updater.getStatus())
  assert.equal(status.type, 'downloaded')
  assert.equal(status.version, '3.1.0')
  await popup.getByRole('button', { name: 'Install & Restart', exact: true }).click()
  await main.evaluate(() => window.api.updater.install())
  assert.deepEqual(await app.evaluate(() => global.qa.installs), [[true, true]])
  assert.equal(await app.evaluate(() => global.qa.main.isVisible()), false)
  console.log(`Updater integration passed: real startup schedule/tray, IPC, preference persistence, snooze across restart/expiry, newer version, disabling during download, actual HTTP transfer/checksum rejection/retry, renderer reload recovery, shared downloads/check exclusion, explicit single install dispatch intercepted. Artifacts: ${output}`)
} finally {
  await app?.close()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}
