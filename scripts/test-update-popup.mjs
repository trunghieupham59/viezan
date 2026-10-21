import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { _electron as electron } from 'playwright'

// Run after npm run build. This launches only a disposable QA app, with its own
// userData and no updater network requests, tray, server or managed AI runtime.
const output = mkdtempSync(path.join(os.tmpdir(), 'viezan-update-popup-'))
const harness = path.join(output, 'main.cjs')
const controller = path.resolve('dist-electron/updateNotification.js')
const stackingProbe = path.join(output, 'stacking.ps1')
writeFileSync(stackingProbe, `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WindowProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr window, int index);
}
'@
[Console]::WriteLine('ready')
while ($null -ne ($line = [Console]::ReadLine())) {
$request = $line | ConvertFrom-Json
$PopupHandle = [long]$request.popup
$TargetHandle = [long]$request.target
$cursor = [WindowProbe]::GetWindow([IntPtr]$TargetHandle, 3)
$above = $false
for ($step = 0; $step -lt 10000 -and $cursor -ne [IntPtr]::Zero; $step++) {
  if ($cursor.ToInt64() -eq $PopupHandle) { $above = $true; break }
  $cursor = [WindowProbe]::GetWindow($cursor, 3)
}
$foreground = [WindowProbe]::GetForegroundWindow()
$foregroundPid = [uint32]0
[void][WindowProbe]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
$targetPid = [uint32]0
[void][WindowProbe]::GetWindowThreadProcessId([IntPtr]$TargetHandle, [ref]$targetPid)
$result = [pscustomobject]@{
  topmost = ([WindowProbe]::GetWindowLong([IntPtr]$PopupHandle, -20) -band 8) -ne 0
  aboveTarget = $above
  targetFocused = $foreground.ToInt64() -eq $TargetHandle
  popupFocused = $foreground.ToInt64() -eq $PopupHandle
  foregroundProcess = (Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue).ProcessName
  targetProcess = (Get-Process -Id $targetPid -ErrorAction SilentlyContinue).ProcessName
  foregroundHandle = $foreground.ToInt64().ToString()
  targetHandle = $TargetHandle.ToString()
} | ConvertTo-Json -Compress
[Console]::WriteLine($result)
}
`)
const focusHarness = path.join(output, 'focus-target.cjs')
writeFileSync(focusHarness, `
const { app, BrowserWindow } = require('electron')
app.setPath('userData', ${JSON.stringify(path.join(output, 'focus-target'))})
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 640, height: 400, show: true })
  await win.loadURL('data:text/html,<title>QA focus target</title><input autofocus placeholder="Focus target">')
  win.focus()
  global.focusTarget = win
})
`)
writeFileSync(harness, `
const { app, BrowserWindow, ipcMain } = require('electron')
app.setPath('userData', ${JSON.stringify(output)})
Object.defineProperty(app, 'isPackaged', { value: true })
app.whenReady().then(async () => {
  const main = new BrowserWindow({ show: false })
  await main.loadURL('data:text/html,<title>QA main</title>')
  const handlers = {}
  const ipc = { handle(name, handler) { handlers[name] = handler; ipcMain.handle(name, handler) } }
  let downloads = 0
  let installs = 0
  const receive = require(${JSON.stringify(controller)}).createUpdateNotification(ipc, () => main, () => main.show(), {
    download: async () => {
      downloads++
      receive({ type: 'downloading', percent: 42 })
      await new Promise(resolve => setTimeout(resolve, 1500))
      receive({ type: 'downloaded', version: '3.1.0' })
      return { success: true }
    },
    install: async () => { installs++; return { success: true } },
  })
  global.qa = { main, receive, handlers, counts: () => ({ downloads, installs }) }
})
`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
let app
let focusApp
let probe
let probeLines
let foregroundBeforePopup
async function nextProbeLine() {
  let timeout
  try {
    return await Promise.race([
      probeLines.next().then(({ value, done }) => {
        assert(!done, 'Native window probe exited unexpectedly')
        return value
      }),
      new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Native window probe timed out')), 10000) }),
    ])
  } finally { clearTimeout(timeout) }
}
async function readNativeStacking(targetHandle = '0') {
  if (process.platform !== 'win32') return
  const popupHandle = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html'))?.getNativeWindowHandle().readBigUInt64LE().toString() ?? '0')
  probe.stdin.write(`${JSON.stringify({ popup: popupHandle, target: targetHandle })}\n`)
  return JSON.parse(await nextProbeLine())
}
async function captureForeground() {
  if (process.platform !== 'win32') return
  const native = await readNativeStacking()
  assert.notEqual(native.foregroundHandle, '0', 'No foreground window for focus test')
  assert.equal(native.popupFocused, false, 'Popup must not be foreground before showing')
  foregroundBeforePopup = native.foregroundHandle
  console.log(`Native foreground baseline: ${native.foregroundProcess} (${foregroundBeforePopup})`)
}
async function assertNativeStacking() {
  if (process.platform !== 'win32') return
  const native = await readNativeStacking(foregroundBeforePopup)
  assert.deepEqual({ topmost: native.topmost, aboveTarget: native.aboveTarget, targetFocused: native.targetFocused },
    { topmost: true, aboveTarget: true, targetFocused: true }, JSON.stringify(native))
}
try {
  // Compile and start the read-only native probe before focusing either QA app.
  // Starting a console process during a focus assertion can disturb foreground.
  if (process.platform === 'win32') {
    probe = spawn('powershell.exe', ['-NoProfile', '-File', stackingProbe], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] })
    probeLines = createInterface({ input: probe.stdout })[Symbol.asyncIterator]()
    assert.equal(await nextProbeLine(), 'ready')
  }
  app = await electron.launch({ args: [harness], env })
  focusApp = await electron.launch({ args: [focusHarness], env })
  await focusApp.evaluate(async () => {
    while (!global.focusTarget) await new Promise(resolve => setTimeout(resolve, 20))
    global.focusTarget.focus()
  })
  await new Promise(resolve => setTimeout(resolve, 1500))
  await captureForeground()
  await app.evaluate(async () => {
    while (!global.qa) await new Promise(resolve => setTimeout(resolve, 20))
    global.qa.receive({ type: 'available', version: '3.0.0', background: true })
  })
  const popup = await app.waitForEvent('window', { predicate: page => page.url().includes('update-notification.html') })
  await popup.getByRole('heading').waitFor()
  // Read after native show has settled: checking only the constructor flag or
  // using another window in the same app missed the Windows regression.
  await new Promise(resolve => setTimeout(resolve, 1000))
  const initial = await app.evaluate(({ BrowserWindow }) => ({
    mainVisible: global.qa.main.isVisible(),
    popupFocused: BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html')).isFocused(),
    top: BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html')).isAlwaysOnTop(),
  }))
  assert.deepEqual(initial, { mainVisible: false, popupFocused: false, top: true })
  const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html'))
    const bounds = win.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    return { bounds, area, dx: Math.abs(bounds.x + bounds.width / 2 - area.x - area.width / 2), dy: Math.abs(bounds.y + bounds.height / 2 - area.y - area.height / 2) }
  })
  assert(geometry.dx <= 1 && geometry.dy <= 1, `Popup is not centered in the display work area: ${JSON.stringify(geometry)}`)
  assert.equal(await focusApp.evaluate(() => global.focusTarget.isFocused()), true, 'Popup stole focus from another application')
  await assertNativeStacking()
  await focusApp.evaluate(() => { global.focusTarget.maximize(); global.focusTarget.focus() })
  await new Promise(resolve => setTimeout(resolve, 500))
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html')).isAlwaysOnTop()), true)
  assert.equal(await focusApp.evaluate(() => global.focusTarget.isFocused()), true)
  await assertNativeStacking()
  for (let sample = 0; sample < 6; sample++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    await assertNativeStacking()
  }
  for (const width of [440, 360]) {
    await app.evaluate(({ BrowserWindow }, width) => {
      const win = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html'))
      win.setResizable(true)
      win.setSize(width, 320)
      win.setResizable(false)
      if (win.getBounds().width !== width) throw new Error('QA window width was not applied')
    }, width)
    for (const locale of ['en', 'vi', 'ja']) {
      for (const theme of ['light', 'dark']) {
        await app.evaluate((_electron, patch) => global.qa.handlers['updater:setNotificationPreferences']({ sender: global.qa.main.webContents }, patch), { locale, theme })
        await popup.waitForFunction(({ locale, theme }) => document.documentElement.lang === locale && document.documentElement.classList.contains('dark') === (theme === 'dark'), { locale, theme })
        const layout = await popup.evaluate(() => ({
          fits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          heights: [...document.querySelectorAll('button')].map(button => button.getBoundingClientRect().height),
        }))
        assert(layout.fits, `Overflow: ${width}/${locale}/${theme}`)
        assert(layout.heights.every(height => height === 36), 'Controls must share md height')
        await popup.screenshot({ path: path.join(output, `${width}-${locale}-${theme}.png`) })
      }
    }
  }
  await app.evaluate(() => global.qa.handlers['updater:setNotificationPreferences']({ sender: global.qa.main.webContents }, { locale: 'en', theme: 'light' }))
  await popup.getByRole('button', { name: 'Remind in 24 hours' }).click()
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html')).isVisible()), false)
  await app.evaluate(() => global.qa.receive({ type: 'available', version: '3.0.0' }))
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('update-notification.html')).isVisible()), false)
  await focusApp.evaluate(() => global.focusTarget.focus())
  await captureForeground()
  await app.evaluate(() => global.qa.receive({ type: 'available', version: '3.1.0' }))
  await popup.locator('.update-popup-version').filter({ hasText: '3.1.0' }).waitFor()
  await assertNativeStacking()
  assert.deepEqual(await app.evaluate(() => global.qa.counts()), { downloads: 0, installs: 0 })
  await popup.getByRole('button', { name: 'Download Update', exact: true }).click()
  await popup.getByRole('status').filter({ hasText: '42%' }).waitFor()
  assert.equal(await popup.getByRole('button', { name: 'Download Update', exact: true }).isDisabled(), true)
  await popup.screenshot({ path: path.join(output, 'downloading.png') })
  await popup.getByRole('button', { name: 'Install & Restart', exact: true }).waitFor()
  assert.deepEqual(await app.evaluate(() => global.qa.counts()), { downloads: 1, installs: 0 })
  await popup.screenshot({ path: path.join(output, 'ready.png') })
  await popup.getByRole('button', { name: 'Install & Restart', exact: true }).click()
  assert.deepEqual(await app.evaluate(() => global.qa.counts()), { downloads: 1, installs: 1 })
  assert.equal(await app.evaluate(() => global.qa.main.isVisible()), false)
  console.log(`Native popup QA passed: centered, focus retained in a separate application, main hidden, native topmost/z-order on first show and re-show, 12 layouts, snooze, direct download/progress/explicit install (simulated). Screenshots: ${output}`)
} finally {
  await app?.close()
  await focusApp?.close()
  probe?.stdin.end()
  probe?.kill()
}
