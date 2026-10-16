// @vitest-environment node
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { compareLocalAiPerformance, configureLocalAiPerformanceStorage, getLocalAiPerformanceProfile, resetLocalAiPerformanceForTests, selectLocalAiPerformance, setLocalAiPerformanceTestPort } from '../localAiPerformance'
import { getOllamaServeLaunch } from '../ollamaProcess'
import { createOllamaProfileFetch } from '../ollamaProfileFetch'

// Explicit opt-in only: temporarily reloads an existing model on port 11434.
describe.runIf(process.platform === 'win32' && process.env.VIEZAN_TEST_LOCAL_AI_COMPARISON === '1')('native GPU / CPU+GPU comparison', () => {
  it('measures actual placement, applies both modes to SDK streams, and restores the resident model', async () => {
    const model = process.env.VIEZAN_TEST_OLLAMA_MODEL || 'gemma3:4b'
    const production = 'http://127.0.0.1:11434'
    const listener = net.createServer()
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))
    const port = (listener.address() as net.AddressInfo).port
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
    const endpoint = `http://127.0.0.1:${port}`
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-performance-evidence-'))
    const tracePath = path.join(directory, 'console.jsonl')
    const snapshot = await fetch(`${production}/api/ps`, { signal: AbortSignal.timeout(3000) }).then(async response => {
      if (!response.ok) throw new Error(`Production snapshot failed: HTTP ${response.status}`)
      return await response.json() as { models: Array<{ name: string; context_length?: number }> }
    }).catch(error => {
      if ((error as { cause?: { code?: string } }).cause?.code !== 'ECONNREFUSED') throw error
      return undefined
    })
    const original = snapshot?.models.find(m => m.name === model)
    // Candidate-binary verification must never interrupt a production model.
    if (process.env.VIEZAN_TEST_STRICT_STREAM === '1') expect(snapshot?.models ?? []).toHaveLength(0)
    // Diagnostic control only. Product startup always uses the hidden-console launcher.
    const directControl = process.env.VIEZAN_TEST_OLLAMA_DIRECT_CONTROL === '1'
    const report: Record<string, unknown> = { model, directory, port, productionWasRunning: Boolean(snapshot), launchMode: directControl ? 'direct-control' : 'hidden-console' }
    const nativeFetch = globalThis.fetch
    const resetProbes: unknown[] = []
    let nativeChatRequests = 0
    const strictStream = process.env.VIEZAN_TEST_STRICT_STREAM === '1'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) === `${endpoint}/api/chat`) nativeChatRequests++
      const response = await nativeFetch(input, init)
      if (response.status === 500 && [`${endpoint}/api/generate`, `${endpoint}/api/chat`].includes(String(input))) {
        const body = await response.clone().json().catch(() => ({})) as { error?: string }
        const runnerPort = /http:\/\/127\.0\.0\.1:(\d+)\/(?:health|tokenize)/.exec(body.error ?? '')?.[1]
        if (runnerPort && Number(runnerPort) >= 1024 && Number(runnerPort) <= 65535) {
          const health = await nativeFetch(`http://127.0.0.1:${runnerPort}/health`, { signal: AbortSignal.timeout(1000) })
            .then(async result => ({ status: result.status, body: await result.json() })).catch(error => ({ error: String(error) }))
          resetProbes.push({ at: new Date().toISOString(), runnerPort: Number(runnerPort), health })
        }
      }
      return response
    })
    let tracer: ChildProcess | undefined
    let runtime: ChildProcess | undefined
    let runtimeExited = false
    configureLocalAiPerformanceStorage(() => path.join(directory, 'profiles.json'))
    setLocalAiPerformanceTestPort(port)
    try {
      if (original) {
        const unloaded = await fetch(`${production}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, keep_alive: 0, stream: false }), signal: AbortSignal.timeout(60_000) })
        expect(unloaded.ok).toBe(true)
        await delay(1500)
      }
      const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      tracer = spawn(powershell, ['-NoProfile', '-NonInteractive', '-Command', '& ([scriptblock]::Create([IO.File]::ReadAllText($env:VIEZAN_TRACE_SCRIPT))) -DurationSeconds 600 -OutputPath $env:VIEZAN_TRACE_OUTPUT'], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIEZAN_TRACE_SCRIPT: path.resolve('scripts/trace-windows-console.ps1'), VIEZAN_TRACE_OUTPUT: tracePath },
      })
      const trace = tracer
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Console recorder did not start')), 15_000)
        trace.once('error', error => { clearTimeout(timeout); reject(error) })
        trace.once('exit', () => { clearTimeout(timeout); reject(new Error('Console recorder exited early')) })
        trace.stdout?.on('data', chunk => { if (chunk.toString().includes('Recording for')) { clearTimeout(timeout); resolve() } })
      })
      const executable = process.env.VIEZAN_TEST_OLLAMA_EXECUTABLE || 'ollama.exe'
      const launch = getOllamaServeLaunch(executable, { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` })
      runtime = directControl
        ? spawn(executable, ['serve'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` } })
        : spawn(launch.command, launch.args, launch.options)
      runtime.on('error', () => { runtimeExited = true })
      runtime.on('exit', () => { runtimeExited = true })
      report.supervisorPid = runtime.pid
      let ready = false
      for (let attempt = 0; attempt < 180; attempt++) {
        if (runtimeExited) throw new Error('Test Ollama exited before readiness')
        try { if ((await fetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break } } catch { /* wait for startup */ }
        await delay(250)
      }
      expect(ready).toBe(true)
      report.version = await (await fetch(`${endpoint}/api/version`)).json()
      const compared = await compareLocalAiPerformance(model, true)
      report.comparison = compared.comparison
      if (compared.comparison?.results.some(r => r.status === 'error')) {
        const diagnostic = `& ([scriptblock]::Create([IO.File]::ReadAllText($env:VIEZAN_CONSOLE_READER))) -SupervisorPid ${runtime.pid}`
        report.runnerLog = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(diagnostic, 'utf16le').toString('base64')], {
          windowsHide: true, encoding: 'utf8', timeout: 15_000,
          env: { ...process.env, VIEZAN_CONSOLE_READER: path.resolve('electron/ipc/__tests__/fixtures/readOllamaTestConsole.ps1') },
        })
      }
      expect(compared.comparison?.results.map(r => r.status)).toEqual(['ok', 'ok'])
      if (strictStream) expect(compared.comparison?.results.every(r => !r.runnerRecoveries)).toBe(true)
      expect(compared.selection).toBeUndefined()
      const applied = []
      for (const mode of ['gpu', 'hybrid'] as const) {
        selectLocalAiPerformance(model, mode)
        const client = new OpenAI({ apiKey: 'local-ai', baseURL: `${endpoint}/v1`, maxRetries: 0,
          fetch: createOllamaProfileFetch(`${endpoint}/v1`, getLocalAiPerformanceProfile(model)) })
        let text = ''
        for (let sample = 0; sample < (strictStream ? 10 : 1); sample++) {
          const stream = await client.chat.completions.create({ model, messages: [{ role: 'user', content: strictStream
            ? 'Count from 1 to 40, separated by spaces. Output only numbers.' : 'Reply with OK.' }], max_tokens: strictStream ? 96 : 8, stream: true })
          let sampleText = ''
          for await (const chunk of stream) sampleText += chunk.choices[0]?.delta?.content ?? ''
          expect(sampleText.trim().length).toBeGreaterThan(0)
          text += sampleText
        }
        const resident = await (await fetch(`${endpoint}/api/ps`)).json() as { models: Array<{ name: string; size: number; size_vram: number }> }
        const loaded = resident.models.find(m => m.name === model)
        const percent = loaded ? loaded.size_vram / loaded.size * 100 : 0
        expect(percent).toBeGreaterThan(0)
        if (mode === 'gpu') expect(percent).toBeGreaterThanOrEqual(95)
        else expect(percent).toBeLessThan(95)
        applied.push({ mode, gpuPercent: percent, responseCharacters: text.length })
      }
      report.applied = applied
      report.nativeChatRequests = nativeChatRequests
      if (strictStream) expect(nativeChatRequests).toBe(20)
      const events = fs.readFileSync(tracePath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
      report.consoleShows = events.filter(event => event.Kind === 'window-show').length
      if (!directControl) expect(report.consoleShows).toBe(0)
    } catch (error) {
      report.failure = String(error)
      throw error
    } finally {
      if (fs.existsSync(tracePath)) {
        const events = fs.readFileSync(tracePath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
        report.consoleShows = events.filter(event => event.Kind === 'window-show').length
        report.runnerExits = events.filter(event => event.Kind === 'process-exited' && event.Ancestry?.[0]?.Name === 'llama-server.exe')
          .map(event => ({ time: event.TimeUtc, pid: event.Ancestry[0].Pid, exitCode: event.ExitCode }))
      }
      selectLocalAiPerformance(model, 'auto')
      if (runtime && !runtimeExited) {
        await fetch(`${endpoint}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, keep_alive: 0, stream: false }), signal: AbortSignal.timeout(60_000) }).catch(() => undefined)
        try { execFileSync('taskkill', ['/PID', String(runtime.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 }) } catch { /* Verify listener below, including races with exiting runners. */ }
      }
      if (original) {
        try {
          const restored = await fetch(`${production}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '30m', options: original.context_length ? { num_ctx: original.context_length } : {} }), signal: AbortSignal.timeout(180_000) })
          report.restored = restored.ok
        } catch (error) { report.restored = false; report.restoreFailure = String(error) }
      }
      let stopped = false
      for (let attempt = 0; attempt < 20; attempt++) {
        try { await fetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(500) }) } catch { stopped = true; break }
        await delay(100)
      }
      report.cleanedUp = stopped
      report.resetProbes = resetProbes
      vi.restoreAllMocks()
      tracer?.kill()
      resetLocalAiPerformanceForTests()
      fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2))
      console.info('Local AI comparison evidence:', path.join(directory, 'result.json'), JSON.stringify({ comparison: report.comparison, consoleShows: report.consoleShows, cleanedUp: report.cleanedUp }))
      expect(stopped).toBe(true)
      if (original) expect(report.restored).toBe(true)
    }
  }, 600_000)
})
