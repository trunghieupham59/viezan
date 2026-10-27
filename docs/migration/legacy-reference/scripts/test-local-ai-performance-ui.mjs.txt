import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const directory = await mkdtemp(path.join(os.tmpdir(), 'viezan-performance-ui-'))
const url = 'http://127.0.0.1:5187'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'web-preview', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
let browser
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(url)).ok) { ready = true; break } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert(ready, 'Isolated web preview did not start')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.waitForFunction(() => Boolean(window.api?.getLocalAiPerformance))
  await page.evaluate(async () => {
    const model = 'gemma3:4b'
    const measured = { model, measuredAt: '2026-10-15T09:00:00Z', recommendedMode: 'gpu', results: ['gpu', 'hybrid'].map((mode, index) => ({
      mode, status: 'ok', profile: { model, mode, numGpuLayers: index ? 17 : 999, contextLength: 2048 },
      tokensPerSecond: index ? 25.3 : 36.9, firstTokenMs: index ? 670 : 608, vramBytes: index ? 1666763980 : 2880385842,
      modelRamBytes: index ? 1813501705 : 0, qualityPassed: true, sampleCount: 2,
      ...(index ? {} : { runnerRecoveries: 1, runnerRecoveryErrors: ['health resp: Get "http://127.0.0.1:50101/health": wsarecv: An existing connection was forcibly closed by the remote host.'] }),
    })) }
    let state = {}
    window.__comparisonCalls = 0
    window.api.ensureLocalAiRuntime = async () => ({ success: true, available: true, engine: 'ollama', models: [{ id: model, name: model }], suggestedModels: [],
      hardware: { platform: 'win32', arch: 'x64', cpuCount: 20, totalMemoryGb: 32, tier: 'balanced', vramGb: 6 } })
    window.api.getLocalAiPerformance = async () => state
    window.api.compareLocalAiPerformance = async request => {
      if (request.consentToReload !== true) throw new Error('Consent missing')
      window.__comparisonCalls++
      state = { comparison: measured }
      return state
    }
    window.api.selectLocalAiPerformance = async (_model, mode) => {
      state = { ...state, selection: measured.results.find(result => result.mode === mode)?.profile }
      return state
    }
    const { useAppStore } = await import('/src/store/useAppStore.ts')
    useAppStore.setState({ locale: 'en', localeAuto: false, settingsOpen: true })
  })
  const section = page.getByRole('region', { name: 'Compare local AI performance', exact: true })
  await section.scrollIntoViewIfNeeded()
  await section.getByRole('button', { name: 'Compare GPU / CPU + GPU', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__comparisonCalls), 0, 'Comparison ran before consent')
  await section.screenshot({ path: path.join(directory, 'confirmation-en.png') })
  await section.getByRole('button', { name: 'Allow reload and compare', exact: true }).click()
  await section.getByText('36.9 tok/s', { exact: true }).waitFor()
  await section.getByText('Runner connection recoveries: 1', { exact: true }).click()
  assert(await section.getByText(/First-token latency includes retries/).isVisible())
  await section.getByRole('button', { name: 'CPU + GPU', exact: true }).click()
  assert.equal(await section.getByRole('button', { name: 'CPU + GPU', exact: true }).getAttribute('aria-pressed'), 'true')
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async value => {
      const { useAppStore } = await import('/src/store/useAppStore.ts')
      useAppStore.setState({ theme: value })
    }, theme)
    for (const locale of ['en', 'vi', 'ja']) {
      await page.evaluate(async value => {
        const { useAppStore } = await import('/src/store/useAppStore.ts')
        useAppStore.setState({ locale: value })
      }, locale)
      for (const width of [1440, 800, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        const panel = page.locator('section.settings-inset').filter({ has: page.getByText('36.9 tok/s', { exact: true }) })
        await panel.scrollIntoViewIfNeeded()
        await page.waitForTimeout(200)
        assert(await panel.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth), `Panel overflows at ${locale}/${width}`)
        assert(await panel.getByRole('table').isVisible())
        await panel.screenshot({ path: path.join(directory, `results-${theme}-${locale}-${width}.png`) })
      }
    }
  }
  assert.deepEqual(errors, [])
  console.log(`Performance UI passed: consent, selection, recovery details, EN/VI/JA in light/dark at 1440/800/390px. Screenshots: ${directory}`)
} finally {
  await browser?.close()
  if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else server.kill()
}
