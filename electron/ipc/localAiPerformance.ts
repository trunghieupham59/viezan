import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import type {
  LocalAiExecutionMode, LocalAiPerformanceComparison, LocalAiPerformanceMeasurement,
  LocalAiPerformanceProfile, LocalAiPerformanceState,
} from '../../shared/localAiPerformance'
import { recoverOllamaRunnerConnection } from './ollamaRunnerRecovery'

const DEFAULT_API = 'http://127.0.0.1:11434/api'
let api = DEFAULT_API
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/
const CONTEXT = 2048
const TIMEOUT = 180_000
const PROMPT = 'Write the numbers 1 to 20 in order, separated by spaces. Output only the numbers.'
const EXPECTED = Array.from({ length: 20 }, (_, index) => String(index + 1)).join(' ')
let storagePath: (() => string) | undefined
let loaded = false
let states = new Map<string, LocalAiPerformanceState>()
let active: AbortController | undefined

export function configureLocalAiPerformanceStorage(getPath: () => string) { storagePath = getPath; loaded = false }
export function isLocalAiPerformanceBusy() { return Boolean(active) }
export function cancelLocalAiPerformance() { active?.abort() }
/** Main-process routing follows the same runtime used by chat and model management. */
export function configureLocalAiPerformancePort(port: number) {
  if (active || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid runtime port')
  api = `http://127.0.0.1:${port}/api`
}
export function resetLocalAiPerformanceForTests() { active?.abort(); active = undefined; states = new Map(); loaded = false; storagePath = undefined; api = DEFAULT_API }
/** Native integration fixtures use a separate loopback runtime, never a remote host. */
export function setLocalAiPerformanceTestPort(port: number) {
  if (process.env.NODE_ENV !== 'test' || active || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid test runtime port')
  api = `http://127.0.0.1:${port}/api`
}

export function isLocalAiPerformanceModel(value: unknown): value is string {
  return typeof value === 'string' && MODEL_PATTERN.test(value) && value !== 'local-auto'
}
function validProfile(value: unknown): value is LocalAiPerformanceProfile {
  const p = value as LocalAiPerformanceProfile | undefined
  return Boolean(p && isLocalAiPerformanceModel(p.model) && (p.mode === 'gpu' || p.mode === 'hybrid')
    && Number.isInteger(p.numGpuLayers) && p.numGpuLayers >= 1 && p.numGpuLayers <= 999
    && Number.isInteger(p.contextLength) && p.contextLength >= 512 && p.contextLength <= 32768)
}
function validMeasurement(r: LocalAiPerformanceMeasurement) {
  if (!validProfile(r?.profile) || r.mode !== r.profile.mode) return false
  if (r.status === 'error') return typeof r.error === 'string'
  return r.status === 'ok' && r.qualityPassed === true && typeof r.tokensPerSecond === 'number' && Number.isFinite(r.tokensPerSecond) && r.tokensPerSecond > 0
    && typeof r.firstTokenMs === 'number' && Number.isFinite(r.firstTokenMs) && r.firstTokenMs >= 0
    && typeof r.gpuPercent === 'number' && Number.isFinite(r.gpuPercent) && r.gpuPercent > 0 && r.gpuPercent <= 100
}
function load() {
  if (loaded) return
  loaded = true
  if (!storagePath) return
  try {
    const saved = JSON.parse(fs.readFileSync(storagePath(), 'utf8'))
    if (saved.version !== 1 || !Array.isArray(saved.models)) return
    for (const entry of saved.models) {
      if (!isLocalAiPerformanceModel(entry?.model)) continue
      // Saved comparisons are informational; only strictly validated profiles execute.
      const selection = validProfile(entry.selection) && entry.selection.model === entry.model ? entry.selection : undefined
      const c = entry.comparison
      const comparison = c?.model === entry.model && typeof c.measuredAt === 'string' && Array.isArray(c.results)
        && c.results.length === 2 && c.results.every((r: LocalAiPerformanceMeasurement) => validMeasurement(r) && r.profile.model === entry.model) ? c : undefined
      states.set(entry.model, { comparison, selection })
    }
  } catch { /* Missing or unreadable preferences keep the runtime's automatic defaults. */ }
}
function save() {
  if (!storagePath) return
  const file = storagePath()
  const temporary = `${file}.${process.pid}.tmp`
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, models: [...states].map(([model, state]) => ({ model, selection: state.selection, comparison: state.comparison })) }), { mode: 0o600 })
    fs.renameSync(temporary, file)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}
export function getLocalAiPerformanceState(model: string): LocalAiPerformanceState {
  load()
  return { ...structuredClone(states.get(model) ?? {}), running: Boolean(active) }
}
export function getLocalAiPerformanceProfile(model: string) {
  return getLocalAiPerformanceState(model).selection
}
export function selectLocalAiPerformance(model: string, mode: LocalAiExecutionMode | 'auto') {
  if (!isLocalAiPerformanceModel(model)) throw new Error('Invalid local model')
  if (active) throw new Error('Local AI comparison is running')
  const previous = getLocalAiPerformanceState(model)
  const measured = previous.comparison?.results.find(result => result.mode === mode && result.status === 'ok' && result.qualityPassed)
  if (mode !== 'auto' && (!measured || !validProfile(measured.profile))) throw new Error('Run a successful comparison before selecting this mode')
  states.set(model, { ...previous, selection: mode === 'auto' ? undefined : measured?.profile })
  try { save() } catch (error) { states.set(model, previous); throw error }
  return getLocalAiPerformanceState(model)
}
export function localAiProfileOptions(profile?: LocalAiPerformanceProfile) {
  return profile ? { num_gpu: profile.numGpuLayers, num_ctx: profile.contextLength } : {}
}

interface ResidentModel { name: string; model?: string; size: number; size_vram: number; context_length?: number }
async function json<T>(route: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(TIMEOUT)
  const response = await fetch(`${api}${route}`, {
    ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  if (!response.ok) throw new Error(`Ollama ${route}: HTTP ${response.status}`)
  return response.json() as Promise<T>
}
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const round = (value: number) => Math.round(value * 10) / 10

async function sampleOnce(profile: LocalAiPerformanceProfile, signal: AbortSignal) {
  const started = performance.now()
  let firstTokenMs: number | undefined
  let text = ''
  let final: { done?: boolean; eval_count?: number; eval_duration?: number; load_duration?: number } | undefined
  const response = await fetch(`${api}/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: profile.model, prompt: PROMPT, think: false, stream: true, keep_alive: '2m',
      options: { ...localAiProfileOptions(profile), num_predict: 96, temperature: 0, seed: 42 } }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)]),
  })
  if (!response.ok || !response.body) {
    const failure = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(`Ollama generation: HTTP ${response.status}: ${failure?.error ?? 'no error detail'}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  const consume = (line: string) => {
    if (!line.trim()) return
    const chunk = JSON.parse(line)
    if (chunk.error) throw new Error(String(chunk.error))
    if (chunk.response) { firstTokenMs ??= performance.now() - started; text += chunk.response }
    if (chunk.done) final = chunk
  }
  try {
    while (true) {
      const next = await reader.read()
      pending += decoder.decode(next.value, { stream: !next.done })
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) consume(line)
      if (next.done) { consume(pending); break }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  if (!final?.done || !final.eval_count || !final.eval_duration || firstTokenMs === undefined) throw new Error('Ollama returned no measurable generation')
  return { tokensPerSecond: final.eval_count / (final.eval_duration / 1e9), firstTokenMs, loadMs: final.load_duration === undefined ? undefined : final.load_duration / 1e6,
    qualityPassed: (text.match(/\b\d+\b/g) ?? []).join(' ') === EXPECTED }
}

async function sample(profile: LocalAiPerformanceProfile, signal: AbortSignal) {
  const started = performance.now()
  const runnerRecoveryErrors: string[] = []
  const budget = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)])
  // The counting task is stateless. Discard every failed attempt completely;
  // never splice partial generations or include them in throughput statistics.
  const measured = await recoverOllamaRunnerConnection(async () => {
    const attemptStarted = performance.now()
    const result = await sampleOnce(profile, budget)
    return { ...result, firstTokenMs: result.firstTokenMs + attemptStarted - started }
  }, budget, error => runnerRecoveryErrors.push(error.message))
  return { ...measured, runnerRecoveryErrors }
}

/** Explicit, disruptive operation. No auto-start, downloads, or automatic selection. */
export async function compareLocalAiPerformance(model: string, consentToReload: boolean): Promise<LocalAiPerformanceState> {
  if (!isLocalAiPerformanceModel(model) || consentToReload !== true) throw new Error('Model reload consent is required')
  if (active) throw new Error('Local AI comparison is already running')
  const controller = new AbortController()
  active = controller
  let original: ResidentModel | undefined
  let touched = false
  let operationError: unknown
  let restorationError: unknown
  const previous = getLocalAiPerformanceState(model)
  try {
    const catalog = await json<{ models: Array<{ name: string }> }>('/tags', undefined, controller.signal)
    if (!catalog.models.some(entry => entry.name === model)) throw new Error('Choose an installed Ollama model')
    const resident = await json<{ models: ResidentModel[] }>('/ps', undefined, controller.signal)
    if (resident.models.some(entry => entry.name !== model && entry.model !== model)) throw new Error('Other models are loaded. Unload them before comparing this model.')
    original = resident.models[0]
    const info = await json<{ model_info?: Record<string, unknown> }>('/show', { model }, controller.signal)
    const blockCount = Object.entries(info.model_info ?? {}).find(([key]) => key.endsWith('.block_count'))?.[1]
    if (typeof blockCount !== 'number' || !Number.isInteger(blockCount) || blockCount < 2) throw new Error('This model does not expose a layer count for a CPU+GPU comparison')
    const results: LocalAiPerformanceMeasurement[] = []
    for (const mode of ['gpu', 'hybrid'] as const) {
      controller.signal.throwIfAborted()
      const profile: LocalAiPerformanceProfile = { model, mode, numGpuLayers: mode === 'gpu' ? 999 : Math.max(1, Math.floor(blockCount / 2)), contextLength: CONTEXT }
      const result: LocalAiPerformanceMeasurement = { mode, profile, status: 'error' }
      try {
        touched = true
        await json('/generate', { model, keep_alive: 0, stream: false }, controller.signal)
        // Windows GPU memory release can lag the unload response. Avoid measuring
        // a false out-of-memory failure while the previous runner is shutting down.
        await delay(1500, undefined, { signal: controller.signal })
        const warm = await sample(profile, controller.signal)
        const samples = [await sample(profile, controller.signal), await sample(profile, controller.signal)]
        const { models } = await json<{ models: ResidentModel[] }>('/ps', undefined, controller.signal)
        const measured = models.find(entry => entry.name === model || entry.model === model)
        if (!measured || measured.size <= 0) throw new Error('Model residency was not reported')
        const gpuPercent = Math.min(100, measured.size_vram / measured.size * 100)
        Object.assign(result, { tokensPerSecond: round(average(samples.map(s => s.tokensPerSecond))), firstTokenMs: round(average(samples.map(s => s.firstTokenMs))),
          ...(warm.loadMs === undefined || warm.runnerRecoveryErrors.length ? {} : { loadMs: round(warm.loadMs) }), gpuPercent: round(gpuPercent), vramBytes: measured.size_vram,
          modelRamBytes: Math.max(0, measured.size - measured.size_vram), qualityPassed: samples.every(s => s.qualityPassed), sampleCount: samples.length })
        const runnerRecoveryErrors = [warm, ...samples].flatMap(s => s.runnerRecoveryErrors)
        if (runnerRecoveryErrors.length) Object.assign(result, { runnerRecoveries: runnerRecoveryErrors.length, runnerRecoveryErrors })
        if (!result.qualityPassed) throw new Error('Benchmark output did not pass the fixed counting task')
        if ((mode === 'gpu' && gpuPercent < 95) || (mode === 'hybrid' && (gpuPercent <= 0 || gpuPercent >= 95))) throw new Error('Ollama did not apply the requested GPU/CPU placement')
        result.status = 'ok'
      } catch (error) {
        controller.signal.throwIfAborted()
        result.error = error instanceof Error ? error.message : String(error)
      }
      results.push(result)
    }
    const successful = results.filter(result => result.status === 'ok').sort((a, b) => (b.tokensPerSecond ?? 0) - (a.tokensPerSecond ?? 0))
    const comparison: LocalAiPerformanceComparison = { model, measuredAt: new Date().toISOString(), results, recommendedMode: successful[0]?.mode }
    states.set(model, { ...previous, comparison })
    try { save() } catch (error) { states.set(model, previous); throw error }
  } catch (error) {
    operationError = error
  } finally {
    try {
      if (touched) {
        await json('/generate', { model, keep_alive: 0, stream: false })
        if (original) await json('/generate', { model, prompt: '', stream: false, keep_alive: '30m',
          options: previous.selection ? localAiProfileOptions(previous.selection) : original.context_length ? { num_ctx: original.context_length } : {} })
      }
    } catch (error) {
      states.set(model, previous)
      restorationError = error
      try { save() } catch { /* Retain the restoration error as the primary failure. */ }
    } finally { active = undefined }
  }
  if (restorationError) throw new Error(`Could not restore the local model after comparison: ${restorationError instanceof Error ? restorationError.message : String(restorationError)}`)
  if (operationError) throw operationError
  return getLocalAiPerformanceState(model)
}
