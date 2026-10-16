// @vitest-environment node
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { getOllamaServeLaunch } from '../ollamaProcess'

// Opt-in; uses installed Ollama and existing models only. Never touches port 11434.
// Set VIEZAN_TEST_OLLAMA_MODEL to additionally require real inference and GPU use.
describe.runIf(process.platform === 'win32' && process.env.VIEZAN_TEST_WINDOWS_OLLAMA === '1')('installed Windows Ollama', () => {
  it('serves on an isolated port with no console-show events and cleans up its tree', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-ollama-console-evidence-'))
    const tracePath = path.join(dir, 'console.jsonl')
    const listener = net.createServer()
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))
    const port = (listener.address() as net.AddressInfo).port
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
    const endpoint = `http://127.0.0.1:${port}`
    const launch = getOllamaServeLaunch(process.env.VIEZAN_TEST_OLLAMA_EXECUTABLE || 'ollama.exe', {
      ...process.env, OLLAMA_HOST: `127.0.0.1:${port}`,
    })
    let runtime: ChildProcess | undefined
    let tracer: ChildProcess | undefined
    let model: string | undefined
    let runtimeExited = false
    const report: Record<string, unknown> = { port, tracePath }
    const query = async <T = unknown>(route: string, body?: unknown, timeout = 5000): Promise<T> => {
      const response = await fetch(`${endpoint}${route}`, {
        ...(body ? { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
        signal: AbortSignal.timeout(timeout),
      })
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(`${route} failed: HTTP ${response.status}: ${failure?.error ?? 'no error detail'}`)
      }
      return response.json() as Promise<T>
    }
    try {
      const traceCommand = '& ([scriptblock]::Create([IO.File]::ReadAllText($env:VIEZAN_TRACE_SCRIPT))) -DurationSeconds 90 -OutputPath $env:VIEZAN_TRACE_OUTPUT'
      tracer = spawn(launch.command, ['-NoProfile', '-NonInteractive', '-Command', traceCommand], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, VIEZAN_TRACE_SCRIPT: path.resolve('scripts/trace-windows-console.ps1'), VIEZAN_TRACE_OUTPUT: tracePath },
      })
      const trace = tracer
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Console recorder did not become ready')), 15_000)
        trace.once('error', error => { clearTimeout(timeout); reject(error) })
        trace.once('exit', () => { clearTimeout(timeout); reject(new Error('Console recorder exited before startup')) })
        trace.stdout?.on('data', chunk => {
          if (chunk.toString().includes('Recording for')) { clearTimeout(timeout); resolve() }
        })
      })
      runtime = spawn(launch.command, launch.args, launch.options)
      runtime.on('error', () => { runtimeExited = true })
      runtime.on('exit', () => { runtimeExited = true })
      report.supervisorPid = runtime.pid
      const deadline = Date.now() + 45_000
      let ready = false
      while (Date.now() < deadline) {
        if (runtimeExited) throw new Error('Ollama supervisor exited before readiness')
        try { report.version = (await query<{ version: string }>('/api/version')).version; ready = true; break } catch { await delay(250) }
      }
      expect(ready).toBe(true)
      const catalog = await query<{ models: Array<{ name: string }> }>('/api/tags')
      report.models = catalog.models.map((entry: { name: string }) => entry.name)
      model = process.env.VIEZAN_TEST_OLLAMA_MODEL
      if (model) {
        expect(report.models).toContain(model)
        const generations = []
        for (let index = 0; index < 2; index++) {
          const generated = await query<{ done: boolean; eval_count: number }>('/api/generate', {
            model, prompt: 'Reply with OK.', stream: false, keep_alive: '2m',
            options: { num_ctx: 512, num_predict: 8, temperature: 0 },
          }, 120_000)
          expect(generated.done).toBe(true)
          expect(generated.eval_count).toBeGreaterThan(0)
          generations.push({ done: generated.done, tokens: generated.eval_count })
        }
        const loaded = await query<{ models: Array<{ name: string; size_vram: number }> }>('/api/ps')
        const active = loaded.models.find((entry: { name: string }) => entry.name === model)
        expect(active?.size_vram).toBeGreaterThan(0)
        report.inference = generations
        report.gpuBytes = active?.size_vram
      }
      await delay(2000)
      const records = fs.readFileSync(tracePath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
      const related = records.filter(record => record.Ancestry?.some((entry: { Pid: number }) => entry.Pid === runtime?.pid))
      expect(related.some(record => record.Ancestry?.[0]?.Name === 'ollama.exe')).toBe(true)
      const shown = related.filter(record => record.Kind === 'window-show')
      const allShown = records.filter(record => record.Kind === 'window-show')
      report.relatedProcesses = related.filter(record => record.Kind === 'process-observed').length
      report.relatedConsoleShows = shown.length
      report.totalConsoleShows = allShown.length
      expect(shown).toHaveLength(0)
      // Keep global events in the evidence too: Terminal hosts can be brokered
      // outside the process tree. Inspect these if another desktop app was active.
    } catch (error) {
      report.failure = String(error)
      throw error
    } finally {
      if (model && !runtimeExited) {
        await query('/api/generate', { model, keep_alive: 0 }, 15_000).catch(() => undefined)
      }
      if (runtime?.pid && !runtimeExited) {
        try {
          execFileSync('taskkill', ['/PID', String(runtime.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 })
        } catch {
          // A runner can exit during taskkill's traversal; verify the listener
          // below rather than treating an already-exited member as a live tree.
          report.cleanupTraversalRaced = true
        }
      }
      tracer?.kill()
      // Wait for the isolated listener to disappear: taskkill must include Ollama.
      let stopped = false
      for (let attempt = 0; attempt < 20; attempt++) {
        try { await query('/api/version', undefined, 500) } catch { stopped = true; break }
        await delay(100)
      }
      report.cleanedUp = stopped
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(report, null, 2))
      console.info('Windows Ollama evidence:', JSON.stringify(report))
      expect(stopped).toBe(true)
    }
  }, 300_000)
})
