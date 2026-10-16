// @vitest-environment node
import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import OpenAI from 'openai'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, shell: {} }))

import { discoverLocalAiRuntimes, keepOllamaModelLoaded, resetLocalAiStateForTests, resolveLocalAiRequestModel, stopManagedLocalAiRuntime } from '../localAi'
import { compareLocalAiPerformance, configureLocalAiPerformanceStorage, resetLocalAiPerformanceForTests, selectLocalAiPerformance } from '../localAiPerformance'

describe.runIf(process.platform === 'win32' && process.env.VIEZAN_TEST_PATCHED_APP === '1')('Viezan patched runtime entry point', () => {
  it('isolates installed Ollama and completes GPU/hybrid chat without retries or consoles', async () => {
    const production = 'http://127.0.0.1:11434'
    const snapshot = await (await fetch(`${production}/api/ps`)).json() as { models: unknown[] }
    // Never unload or interrupt a user-owned model for this test.
    expect(snapshot.models).toHaveLength(0)
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-app-runtime-'))
    const traceFile = path.join(directory, 'console.jsonl')
    const report: Record<string, unknown> = { directory }
    const originalResources = process.resourcesPath
    const originalFetch = globalThis.fetch
    let trace: ChildProcess | undefined
    let endpoint = ''
    let chats = 0
    resetLocalAiStateForTests(); resetLocalAiPerformanceForTests()
    ;(process as { resourcesPath: string }).resourcesPath = path.resolve('resources')
    configureLocalAiPerformanceStorage(() => path.join(directory, 'profiles.json'))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith(production)) throw new Error('Product flow contacted installed Ollama')
      if (url.endsWith('/api/chat')) chats++
      return originalFetch(input, init)
    })
    try {
      trace = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& ([scriptblock]::Create([IO.File]::ReadAllText($env:VIEZAN_TRACE_SCRIPT))) -DurationSeconds 600 -OutputPath $env:VIEZAN_TRACE_OUTPUT'], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIEZAN_TRACE_SCRIPT: path.resolve('scripts/trace-windows-console.ps1'), VIEZAN_TRACE_OUTPUT: traceFile },
      })
      const recorder = trace
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Recorder timeout')), 15_000)
        recorder.once('error', error => { clearTimeout(timer); reject(error) })
        recorder.stdout?.on('data', chunk => { if (chunk.toString().includes('Recording for')) { clearTimeout(timer); resolve() } })
      })
      const discovery = await discoverLocalAiRuntimes(true)
      expect(discovery.available).toBe(true)
      expect(discovery.endpoint).not.toContain(':11434/')
      if (!discovery.endpoint) throw new Error('No app runtime endpoint')
      endpoint = discovery.endpoint.replace('/v1', '')
      report.endpoint = endpoint
      expect(discovery.models.some(model => model.id === 'gemma3:4b')).toBe(true)
      report.version = await (await fetch(`${endpoint}/api/version`)).json()
      const result = await compareLocalAiPerformance('gemma3:4b', true)
      report.comparison = result.comparison
      expect(result.comparison?.results.map(item => item.status)).toEqual(['ok', 'ok'])
      expect(result.comparison?.results.every(item => !item.runnerRecoveries)).toBe(true)
      for (const mode of ['gpu', 'hybrid'] as const) {
        selectLocalAiPerformance('gemma3:4b', mode)
        const config = await resolveLocalAiRequestModel('gemma3:4b')
        expect(config.baseURL).toBe(`${endpoint}/v1`)
        await keepOllamaModelLoaded(config.model)
        const client = new OpenAI({ apiKey: 'local', baseURL: config.baseURL, fetch: config.fetch, maxRetries: 0 })
        for (let i = 0; i < 10; i++) {
          const stream = await client.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: 'Count from 1 to 40, separated by spaces. Output only numbers.' }], max_tokens: 96, stream: true })
          let content = ''
          let finished = false
          for await (const chunk of stream) { content += chunk.choices[0]?.delta.content ?? ''; finished ||= Boolean(chunk.choices[0]?.finish_reason) }
          expect(content.length).toBeGreaterThan(0)
          expect(finished).toBe(true)
        }
        const resident = await (await fetch(`${endpoint}/api/ps`)).json() as { models: Array<{ name: string; size_vram: number; size: number }> }
        const model = resident.models.find((item: { name: string }) => item.name === config.model)
        if (!model) throw new Error('Model was not resident')
        const percent = model.size_vram / model.size * 100
        report[mode] = { gpuPercent: percent, completedChats: 10 }
        expect(percent).toBeGreaterThan(0)
        if (mode === 'gpu') expect(percent).toBeGreaterThanOrEqual(95)
        else expect(percent).toBeLessThan(95)
      }
      expect(chats).toBe(20)
      report.nativeChatRequests = chats
    } catch (error) { report.failure = String(error); throw error } finally {
      stopManagedLocalAiRuntime()
      let stopped = !endpoint
      for (let i = 0; i < 30 && !stopped; i++) {
        try { await originalFetch(`${endpoint}/api/version`, { signal: AbortSignal.timeout(500) }); await delay(100) } catch { stopped = true }
      }
      report.cleanedUp = stopped
      report.productionAfter = await (await originalFetch(`${production}/api/ps`)).json()
      const events = fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) : []
      report.consoleShows = events.filter(event => event.Kind === 'window-show').length
      trace?.kill()
      ;(process as { resourcesPath: string }).resourcesPath = originalResources
      vi.restoreAllMocks(); resetLocalAiStateForTests(); resetLocalAiPerformanceForTests()
      fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(report, null, 2))
      console.info('App runtime evidence:', path.join(directory, 'result.json'))
      expect(stopped).toBe(true)
      expect(report.consoleShows).toBe(0)
      expect(report.productionAfter).toEqual(snapshot)
    }
  }, 600_000)
})
