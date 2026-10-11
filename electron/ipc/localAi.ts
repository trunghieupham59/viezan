import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { type IpcMain, shell, type WebContents } from 'electron'

export type LocalAiEngine = 'ollama' | 'lmstudio' | 'llamacpp'
export type LocalAiHardwareTier = 'low' | 'balanced' | 'powerful' | 'max'

export interface LocalAiRuntimeCandidate {
  engine: LocalAiEngine
  endpoint: string
  managementEndpoint?: string
}

export interface LocalAiModel {
  id: string
  name: string
  description: string
  engine?: LocalAiEngine
  sizeBytes?: number
  contextLength?: number
  supportsVision?: boolean
  downloadModel?: string
  estimatedSizeGb?: number
  recommendedTier?: LocalAiHardwareTier
  installed?: boolean
}

export interface LocalAiHardwareProfile {
  platform: NodeJS.Platform
  arch: string
  cpuCount: number
  totalMemoryGb: number
  tier: LocalAiHardwareTier
}

export interface LocalAiDiscoveryResult {
  success: boolean
  available: boolean
  engine?: LocalAiEngine
  endpoint?: string
  models: LocalAiModel[]
  suggestedModels: LocalAiModel[]
  recommendedModel?: string
  hardware: LocalAiHardwareProfile
  error?: string
}

export interface LocalAiDownloadResult {
  success: boolean
  model: string
  error?: string
  /** True when the download was stopped by the user (see cancelLocalAiModelDownload). */
  cancelled?: boolean
}

export interface LocalAiModelActionResult {
  success: boolean
  model: string
  error?: string
}

export interface LocalAiModelDownloadProgress {
  model: string
  status: 'running' | 'success' | 'error'
  percent: number
  message: string
  completedBytes?: number
  totalBytes?: number
}

export interface LocalAiInstallResult {
  success: boolean
  error?: string
  message?: string
  output?: string
  manual?: boolean
}

export interface LocalAiBenchmarkMetrics {
  cpuScore: number
  memoryScore: number
  combinedScore: number
  durationMs: number
  runtimeModel?: string
  runtimeLatencyMs?: number
  runtimeTokensPerSecond?: number
}

export interface LocalAiBenchmarkResult {
  hardware: LocalAiHardwareProfile
  suggestedModels: LocalAiModel[]
  recommendedModel?: string
  metrics: LocalAiBenchmarkMetrics
}

interface OpenAiChatCompletion {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

interface OllamaPullProgress {
  status?: string
  digest?: string
  total?: number
  completed?: number
  error?: string
}

interface OpenAiModelList {
  data?: Array<{
    id?: string
    name?: string
    owned_by?: string
    meta?: {
      n_ctx_train?: number
      size?: number
      n_params?: number
      capabilities?: unknown
    } | null
  }>
}

export const LOCAL_PROVIDER_ID = 'local'
export const LOCAL_AI_AUTO_MODEL = 'local-auto'
export const LOCAL_AI_PLACEHOLDER_KEY = 'local-ai'

const LOCAL_AI_PROBE_TIMEOUT_MS = 1200
const LOCAL_AI_CACHE_TTL_MS = 5000
const LOCAL_AI_RUNTIME_BENCHMARK_TIMEOUT_MS = 15_000
const LOCAL_AI_RUNTIME_START_TIMEOUT_MS = 18_000
const LOCAL_AI_RUNTIME_START_POLL_MS = 600
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'
/** After a failed managed-Ollama start, chat requests skip the ~54 s wait/spawn for this long. */
const OLLAMA_START_COOLDOWN_MS = 60_000
/** A model pull that produces no bytes/progress for this long is aborted. */
/** No stream activity at all for this long means the pull is stalled. */
const OLLAMA_PULL_IDLE_TIMEOUT_MS = 300_000
/**
 * Ollama emits no progress while it verifies the sha256 of multi-GB blobs or writes the
 * manifest, which can take many minutes on a slow disk. Use a longer idle limit while the
 * last reported status is one of those silent phases.
 */
const OLLAMA_PULL_VERIFY_IDLE_TIMEOUT_MS = 1_200_000
const OLLAMA_PULL_SILENT_STATUS = /verifying|writing manifest/i
/** Best-effort management calls (unload) must not hang the uninstall flow. */
const OLLAMA_MANAGEMENT_TIMEOUT_MS = 8_000
const OLLAMA_UNLOAD_TIMEOUT_MS = 5_000
const TASKKILL_TIMEOUT_MS = 3_000
const SAFE_MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,199}$/

export const LOCAL_AI_RUNTIME_CANDIDATES: LocalAiRuntimeCandidate[] = [
  { engine: 'ollama', endpoint: 'http://127.0.0.1:11434/v1', managementEndpoint: 'http://127.0.0.1:11434/api' },
  { engine: 'lmstudio', endpoint: 'http://127.0.0.1:1234/v1' },
  { engine: 'llamacpp', endpoint: 'http://127.0.0.1:8080/v1' },
]

let discoveryCache: { expiresAt: number; result: LocalAiDiscoveryResult } | null = null
let activeOllamaStart: Promise<LocalAiDiscoveryResult> | null = null
let managedOllamaProcess: ChildProcess | null = null
/** Timestamp of the last failed managed-Ollama start (0 = none / recovered). */
let ollamaStartFailedAt = 0
/** In-flight model pulls keyed by Ollama model name, so they can be cancelled and not duplicated. */
const activeModelDownloads = new Map<string, AbortController>()

/** Test-only: reset module-level runtime/download bookkeeping. */
export function resetLocalAiStateForTests(): void {
  managedOllamaProcess = null
  ollamaStartFailedAt = 0
  activeOllamaStart = null
  discoveryCache = null
  for (const controller of activeModelDownloads.values()) controller.abort()
  activeModelDownloads.clear()
}

export function isLocalProvider(provider: string) {
  return provider === LOCAL_PROVIDER_ID
}

export function getLocalAiHardwareProfile(): LocalAiHardwareProfile {
  const totalMemoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  const cpuCount = Math.max(os.cpus().length, 1)
  let tier: LocalAiHardwareTier = 'low'

  if (totalMemoryGb >= 32 && cpuCount >= 8) tier = 'max'
  else if (totalMemoryGb >= 16 && cpuCount >= 6) tier = 'powerful'
  else if (totalMemoryGb >= 8 && cpuCount >= 4) tier = 'balanced'

  return {
    platform: process.platform,
    arch: process.arch,
    cpuCount,
    totalMemoryGb,
    tier,
  }
}

function getModelSizeHintGb(modelId: string, sizeBytes?: number): number {
  if (sizeBytes && sizeBytes > 0) return sizeBytes / 1024 ** 3
  const lower = modelId.toLowerCase()
  const paramMatch = lower.match(/(?:^|[:\-_])(\d+(?:\.\d+)?)b(?:$|[:\-_])/)
  if (paramMatch) {
    const paramsB = Number.parseFloat(paramMatch[1])
    if (Number.isFinite(paramsB)) return Math.max(paramsB * 0.65, 0.5)
  }
  return lower.includes('30b') || lower.includes('32b') ? 20
    : lower.includes('27b') ? 17
      : lower.includes('14b') ? 9
        : lower.includes('12b') ? 8
          : lower.includes('8b') ? 5
            : lower.includes('4b') ? 3
              : lower.includes('3b') ? 2
                : lower.includes('1b') ? 1
                  : 4
}

function maxRecommendedModelSizeGb(tier: LocalAiHardwareTier): number {
  if (tier === 'max') return 22
  if (tier === 'powerful') return 10
  if (tier === 'balanced') return 5.5
  return 2.5
}

function getLocalAiModelCatalog(hardware = getLocalAiHardwareProfile()): LocalAiModel[] {
  const catalog: LocalAiModel[] = [
    {
      id: 'llama3.2:1b',
      name: 'Llama 3.2 1B',
      description: 'Fastest option for low-memory machines',
      downloadModel: 'llama3.2:1b',
      recommendedTier: 'low',
    },
    {
      id: 'llama3.2:3b',
      name: 'Llama 3.2 3B',
      description: 'Small, responsive translation and chat model',
      downloadModel: 'llama3.2:3b',
      recommendedTier: 'balanced',
    },
    {
      id: 'deepseek-r1:1.5b',
      name: 'DeepSeek R1 1.5B',
      description: 'Small reasoning model for low-memory machines',
      downloadModel: 'deepseek-r1:1.5b',
      recommendedTier: 'low',
    },
    {
      id: 'qwen3:4b',
      name: 'Qwen3 4B',
      description: 'Recommended balanced multilingual model',
      downloadModel: 'qwen3:4b',
      recommendedTier: 'balanced',
    },
    {
      id: 'gemma3:4b',
      name: 'Gemma 3 4B',
      description: 'Balanced model with vision-capable local runtimes',
      downloadModel: 'gemma3:4b',
      recommendedTier: 'balanced',
      supportsVision: true,
    },
    {
      id: 'phi4-mini:latest',
      name: 'Phi-4 Mini',
      description: 'Compact general local model for responsive tasks',
      downloadModel: 'phi4-mini:latest',
      recommendedTier: 'balanced',
    },
    {
      id: 'mistral:7b',
      name: 'Mistral 7B',
      description: 'General-purpose instruct model with broad local support',
      downloadModel: 'mistral:7b',
      recommendedTier: 'powerful',
    },
    {
      id: 'deepseek-r1:7b',
      name: 'DeepSeek R1 7B',
      description: 'Reasoning-focused model for stronger local machines',
      downloadModel: 'deepseek-r1:7b',
      recommendedTier: 'powerful',
    },
    {
      id: 'qwen3:8b',
      name: 'Qwen3 8B',
      description: 'Higher quality local model for stronger machines',
      downloadModel: 'qwen3:8b',
      recommendedTier: 'powerful',
    },
    {
      id: 'gemma3:12b',
      name: 'Gemma 3 12B',
      description: 'Powerful local model with vision-capable runtimes',
      downloadModel: 'gemma3:12b',
      recommendedTier: 'powerful',
      supportsVision: true,
    },
    {
      id: 'qwen3:14b',
      name: 'Qwen3 14B',
      description: 'Strong local reasoning and multilingual quality',
      downloadModel: 'qwen3:14b',
      recommendedTier: 'max',
    },
    {
      id: 'deepseek-r1:14b',
      name: 'DeepSeek R1 14B',
      description: 'High-quality local reasoning model for max-tier systems',
      downloadModel: 'deepseek-r1:14b',
      recommendedTier: 'max',
    },
    {
      id: 'gemma3:27b',
      name: 'Gemma 3 27B',
      description: 'High-end local model for max-tier systems',
      downloadModel: 'gemma3:27b',
      recommendedTier: 'max',
      supportsVision: true,
    },
  ]

  return catalog
    .map((model) => ({
      ...model,
      estimatedSizeGb: Math.round(getModelSizeHintGb(model.id, model.sizeBytes) * 10) / 10,
      description: `${model.description} · ${describeLocalModel(model, hardware)}`,
    }))
    .sort((a, b) => scoreLocalModelForHardware(b, hardware) - scoreLocalModelForHardware(a, hardware))
}

export function scoreLocalModelForHardware(model: LocalAiModel, hardware = getLocalAiHardwareProfile()): number {
  const id = model.id.toLowerCase()
  const sizeGb = getModelSizeHintGb(model.id, model.sizeBytes)
  const maxSizeGb = maxRecommendedModelSizeGb(hardware.tier)
  let score = 100

  if (sizeGb > maxSizeGb) score -= (sizeGb - maxSizeGb) * 35
  else score += sizeGb * 8

  if (id.includes('qwen3')) score += 42
  if (id.includes('gemma3')) score += 38
  if (id.includes('deepseek-r1')) score += 34
  if (id.includes('llama3.2')) score += 28
  if (id.includes('llama3.1')) score += 20
  if (id.includes('mistral') || id.includes('phi')) score += 16
  if (id.includes('instruct') || id.includes('it')) score += 10
  if (id.includes('vision') || model.supportsVision) score += 6
  if (id.includes('embed') || id.includes('embedding')) score -= 120
  if (id.includes('rerank')) score -= 120
  if (id.includes('coder') || id.includes('code')) score -= 12
  if (id.includes('base')) score -= 25

  if (hardware.tier === 'low' && sizeGb <= 2.5) score += 22
  if (hardware.tier === 'balanced' && sizeGb >= 2.5 && sizeGb <= 5.5) score += 22
  if (hardware.tier === 'powerful' && sizeGb >= 5 && sizeGb <= 10) score += 20
  if (hardware.tier === 'max' && sizeGb >= 8 && sizeGb <= 22) score += 18

  return score
}

export function recommendLocalModel(models: LocalAiModel[], hardware = getLocalAiHardwareProfile()): string | undefined {
  const chatModels = models.filter((model) => scoreLocalModelForHardware(model, hardware) > 0)
  if (chatModels.length === 0) return models[0]?.id
  return chatModels.reduce((best, model) =>
    scoreLocalModelForHardware(model, hardware) > scoreLocalModelForHardware(best, hardware) ? model : best
  ).id
}

function runCpuBenchmark(targetMs = 180) {
  const startedAt = performance.now()
  const endAt = startedAt + targetMs
  let iterations = 0
  let value = 0x12345678

  while (performance.now() < endAt) {
    for (let i = 0; i < 50_000; i += 1) {
      value = Math.imul(value ^ (value >>> 13), 0x5bd1e995)
      iterations += 1
    }
  }

  const elapsedMs = Math.max(performance.now() - startedAt, 1)
  return Math.round((iterations / elapsedMs) / 100)
}

function runMemoryBenchmark(targetMs = 140) {
  const startedAt = performance.now()
  const endAt = startedAt + targetMs
  const buffer = new Float64Array(256 * 1024)
  let rounds = 0
  let checksum = 0

  while (performance.now() < endAt) {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = (buffer[i] + i + rounds) % 1024
      checksum += buffer[i]
    }
    rounds += 1
  }

  const elapsedMs = Math.max(performance.now() - startedAt, 1)
  const bytesTouched = rounds * buffer.byteLength
  if (checksum === Number.NEGATIVE_INFINITY) return 0
  return Math.round((bytesTouched / 1024 ** 2 / elapsedMs) * 100)
}

function estimateTokenCount(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return 1
  return Math.max(Math.ceil(trimmed.length / 4), trimmed.split(/\s+/).length)
}

async function runRuntimeBenchmark(discovery: LocalAiDiscoveryResult): Promise<Partial<LocalAiBenchmarkMetrics>> {
  if (!discovery.available || !discovery.endpoint) return {}
  const model = discovery.recommendedModel ?? discovery.models[0]?.id
  if (!model) return {}

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOCAL_AI_RUNTIME_BENCHMARK_TIMEOUT_MS)
  const startedAt = performance.now()
  try {
    const response = await fetch(`${discovery.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LOCAL_AI_PLACEHOLDER_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a concise local AI benchmark responder.' },
          { role: 'user', content: 'Reply with exactly eight words about local AI performance.' },
        ],
        max_tokens: 32,
        temperature: 0,
        stream: false,
      }),
    })
    if (!response.ok) return {}
    const payload = await response.json() as OpenAiChatCompletion
    const content = payload.choices?.[0]?.message?.content ?? ''
    const latencyMs = Math.max(performance.now() - startedAt, 1)
    const tokens = estimateTokenCount(content)
    return {
      runtimeModel: model,
      runtimeLatencyMs: Math.round(latencyMs),
      runtimeTokensPerSecond: Math.round((tokens / latencyMs) * 1000 * 10) / 10,
    }
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

export async function benchmarkLocalAiSystem(): Promise<LocalAiBenchmarkResult> {
  const benchmarkStartedAt = performance.now()
  const baseHardware = getLocalAiHardwareProfile()
  const cpuScore = runCpuBenchmark()
  const memoryScore = runMemoryBenchmark()
  const combinedScore = Math.round(cpuScore * 0.65 + memoryScore * 0.35)
  const runtimeMetrics = await runRuntimeBenchmark(await discoverLocalAiRuntimes(true))
  const hardware = {
    ...baseHardware,
    tier: tierFromBenchmark(baseHardware, combinedScore),
  }
  const suggestedModels = getLocalAiModelCatalog(hardware)
  return {
    hardware,
    suggestedModels,
    recommendedModel: suggestedModels[0]?.id,
    metrics: {
      cpuScore,
      memoryScore,
      combinedScore,
      durationMs: Math.round(performance.now() - benchmarkStartedAt),
      ...runtimeMetrics,
    },
  }
}

function tierFromBenchmark(hardware: LocalAiHardwareProfile, combinedScore: number): LocalAiHardwareTier {
  if (hardware.totalMemoryGb >= 32 && hardware.cpuCount >= 8 && combinedScore >= 250) return 'max'
  if (hardware.totalMemoryGb >= 16 && hardware.cpuCount >= 6 && combinedScore >= 160) return 'powerful'
  if (hardware.totalMemoryGb >= 8 && hardware.cpuCount >= 4 && combinedScore >= 80) return 'balanced'
  return 'low'
}

function describeLocalModel(model: LocalAiModel, hardware: LocalAiHardwareProfile): string {
  if (model.id === LOCAL_AI_AUTO_MODEL) return 'Auto-select best local model'
  const sizeGb = getModelSizeHintGb(model.id, model.sizeBytes)
  const fit = sizeGb <= maxRecommendedModelSizeGb(hardware.tier) ? 'Recommended fit' : 'May be slow'
  return model.supportsVision ? `${fit} · Vision` : fit
}

function normalizeModels(payload: OpenAiModelList, engine: LocalAiEngine, hardware: LocalAiHardwareProfile): LocalAiModel[] {
  return (payload.data ?? [])
    .map((item) => {
      const id = String(item.id ?? item.name ?? '').trim()
      if (!id) return null
      const model: LocalAiModel = {
        id,
        name: id,
        description: '',
        engine,
        sizeBytes: item.meta?.size,
        estimatedSizeGb: Math.round(getModelSizeHintGb(id, item.meta?.size) * 10) / 10,
        contextLength: item.meta?.n_ctx_train,
        supportsVision: id.toLowerCase().includes('vision') || id.toLowerCase().includes('gemma3'),
      }
      model.description = describeLocalModel(model, hardware)
      return model
    })
    .filter((model): model is LocalAiModel => model !== null)
}

function markInstalledSuggestions(suggestedModels: LocalAiModel[], installedModels: LocalAiModel[]) {
  const installedIds = new Set(installedModels.map((model) => model.id.toLowerCase()))
  return suggestedModels.map((model) => ({
    ...model,
    installed: installedIds.has(model.id.toLowerCase()),
  }))
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJsonWithTimeout(url: string, timeoutMs = LOCAL_AI_PROBE_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function probeLocalAiRuntime(candidate: LocalAiRuntimeCandidate): Promise<LocalAiDiscoveryResult | null> {
  const hardware = getLocalAiHardwareProfile()
  try {
    const payload = await fetchJsonWithTimeout(`${candidate.endpoint}/models`) as OpenAiModelList
    const models = normalizeModels(payload, candidate.engine, hardware)
    const suggestedModels = markInstalledSuggestions(getLocalAiModelCatalog(hardware), models)
    const recommendedModel = recommendLocalModel(models, hardware)
    return {
      success: true,
      available: true,
      engine: candidate.engine,
      endpoint: candidate.endpoint,
      models,
      suggestedModels,
      recommendedModel,
      hardware,
    }
  } catch {
    return null
  }
}

export async function discoverLocalAiRuntimes(force = false): Promise<LocalAiDiscoveryResult> {
  const now = Date.now()
  if (!force && discoveryCache && discoveryCache.expiresAt > now) {
    return discoveryCache.result
  }

  for (const candidate of LOCAL_AI_RUNTIME_CANDIDATES) {
    const result = await probeLocalAiRuntime(candidate)
    if (result) {
      discoveryCache = { expiresAt: now + LOCAL_AI_CACHE_TTL_MS, result }
      return result
    }
  }

  const result: LocalAiDiscoveryResult = {
    success: false,
    available: false,
    models: [],
    suggestedModels: getLocalAiModelCatalog(getLocalAiHardwareProfile()),
    hardware: getLocalAiHardwareProfile(),
    error: 'No local AI runtime found. Start a supported local runtime and refresh.',
  }
  discoveryCache = { expiresAt: now + LOCAL_AI_CACHE_TTL_MS, result }
  return result
}

function getOllamaRuntimeCandidate() {
  return LOCAL_AI_RUNTIME_CANDIDATES.find((candidate) => candidate.engine === 'ollama') ?? LOCAL_AI_RUNTIME_CANDIDATES[0]
}

function createUnavailableLocalAiResult(error: string): LocalAiDiscoveryResult {
  return {
    success: false,
    available: false,
    models: [],
    suggestedModels: getLocalAiModelCatalog(getLocalAiHardwareProfile()),
    hardware: getLocalAiHardwareProfile(),
    error,
  }
}

function getBundledOllamaExecutablePath() {
  const resourcesPath = process.resourcesPath
  if (!resourcesPath) return null
  const executable = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  const platformDir = process.platform === 'darwin'
    ? 'macos'
    : process.platform === 'win32'
      ? 'windows'
      : 'linux'
  const candidates = [
    path.join(resourcesPath, 'local-ai', 'ollama', platformDir, process.arch, executable),
    path.join(resourcesPath, 'local-ai', 'ollama', platformDir, executable),
    path.join(resourcesPath, 'local-ai', 'ollama', executable),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function isManagedOllamaAlive(): boolean {
  const child = managedOllamaProcess
  return Boolean(child) && child?.exitCode === null && child?.signalCode === null
}

function startDetachedProcess(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; trackManaged?: boolean } = {}) {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const child = spawn(command, args, {
      detached: true,
      env: options.env,
      stdio: 'ignore',
      windowsHide: true,
    })
    const settle = (started: boolean) => {
      if (settled) return
      settled = true
      if (started) {
        if (options.trackManaged) managedOllamaProcess = child
        child.unref()
      }
      resolve(started)
    }

    child.once('error', () => settle(false))
    child.once('spawn', () => settle(true))
    // Forget the child as soon as it dies so a later start can respawn cleanly.
    child.once('exit', () => {
      if (managedOllamaProcess === child) managedOllamaProcess = null
    })
  })
}

async function waitForOllamaRuntime(timeoutMs = LOCAL_AI_RUNTIME_START_TIMEOUT_MS) {
  const candidate = getOllamaRuntimeCandidate()
  const expiresAt = Date.now() + timeoutMs
  while (Date.now() < expiresAt) {
    const result = await probeLocalAiRuntime(candidate)
    if (result?.available) {
      discoveryCache = { expiresAt: Date.now() + LOCAL_AI_CACHE_TTL_MS, result }
      return result
    }
    await delay(LOCAL_AI_RUNTIME_START_POLL_MS)
  }
  return null
}

async function startBundledOllamaRuntime() {
  const executablePath = getBundledOllamaExecutablePath()
  if (!executablePath) return null

  // Never spawn a second `ollama serve` while one we started is still alive.
  if (!isManagedOllamaAlive()) {
    const started = await startDetachedProcess(executablePath, ['serve'], {
      env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
      trackManaged: true,
    })
    if (!started) return null
  }
  return waitForOllamaRuntime()
}

function openMacOllamaApp() {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const child = spawn('/usr/bin/open', ['-g', '-a', 'Ollama', '--args', 'hidden'], {
      stdio: 'ignore',
    })
    const settle = (opened: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(opened)
    }
    const timer = setTimeout(() => settle(true), 1500)

    child.once('error', () => settle(false))
    child.once('close', (code) => settle(code === 0))
  })
}

async function startInstalledOllamaApp() {
  if (process.platform !== 'darwin') return null

  const opened = await openMacOllamaApp()
  if (!opened) return null
  return waitForOllamaRuntime()
}

async function startOllamaCliRuntime() {
  // A live managed child (e.g. the bundled server that is still warming up) is the
  // same `ollama serve`; spawning another would leak the first and fight over the port.
  if (isManagedOllamaAlive()) return null

  const executable = process.platform === 'win32' ? 'ollama.exe' : 'ollama'
  const started = await startDetachedProcess(executable, ['serve'], {
    env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
    trackManaged: true,
  })
  if (!started) return null
  return waitForOllamaRuntime()
}

function isInOllamaStartCooldown(): boolean {
  return ollamaStartFailedAt > 0 && Date.now() - ollamaStartFailedAt < OLLAMA_START_COOLDOWN_MS
}

const OLLAMA_UNAVAILABLE_MESSAGE = 'No local AI runtime found. Install Ollama or start LM Studio/llama.cpp and refresh.'

async function startManagedOllamaRuntime(force: boolean): Promise<LocalAiDiscoveryResult> {
  const existing = await probeLocalAiRuntime(getOllamaRuntimeCandidate())
  if (existing?.available) {
    ollamaStartFailedAt = 0
    return existing
  }

  // Automatic callers (chat requests) back off after a failed start; explicit
  // user actions (force) always retry.
  if (!force && isInOllamaStartCooldown()) {
    return createUnavailableLocalAiResult(OLLAMA_UNAVAILABLE_MESSAGE)
  }

  const runtime = await tryStartOllamaRuntime()
  if (runtime?.available) {
    ollamaStartFailedAt = 0
    return runtime
  }

  ollamaStartFailedAt = Date.now()
  return createUnavailableLocalAiResult(OLLAMA_UNAVAILABLE_MESSAGE)
}

async function tryStartOllamaRuntime(): Promise<LocalAiDiscoveryResult | null> {
  const bundled = await startBundledOllamaRuntime()
  if (bundled?.available) return bundled

  const appRuntime = await startInstalledOllamaApp()
  if (appRuntime?.available) return appRuntime

  const cliRuntime = await startOllamaCliRuntime()
  if (cliRuntime?.available) return cliRuntime
  return null
}

async function ensureOllamaRuntime(force = false): Promise<LocalAiDiscoveryResult> {
  const existing = await probeLocalAiRuntime(getOllamaRuntimeCandidate())
  if (existing?.available) return existing

  if (!activeOllamaStart) {
    activeOllamaStart = startManagedOllamaRuntime(force)
      .finally(() => {
        activeOllamaStart = null
      })
  }
  return activeOllamaStart
}

/**
 * Resolve a running local runtime. Any detected engine (Ollama, LM Studio, llama.cpp)
 * is used as-is — Ollama is only spawned when NONE is running. Pass `force` for an
 * explicit user action to bypass the post-failure start cool-down.
 */
export async function ensureLocalAiRuntime(force = false): Promise<LocalAiDiscoveryResult> {
  const discovered = await discoverLocalAiRuntimes(true)
  if (discovered.available) return discovered

  return ensureOllamaRuntime(force)
}

export function stopManagedLocalAiRuntime() {
  const child = managedOllamaProcess
  managedOllamaProcess = null
  if (!child?.pid) return
  const pid = child.pid

  if (process.platform === 'win32') {
    // process.kill(-pid) is POSIX-only. taskkill /T /F ends the whole tree
    // (ollama.exe plus its runner children); argv array, no shell.
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        timeout: TASKKILL_TIMEOUT_MS,
        windowsHide: true,
      })
      return
    } catch {
      // Already exited or taskkill failed — fall back to a direct kill below.
    }
  } else {
    try {
      process.kill(-pid, 'SIGTERM')
      return
    } catch {
      // Not a group leader / already gone — fall back to a direct kill below.
    }
  }

  try {
    child.kill('SIGTERM')
  } catch {
    // Managed runtime shutdown is best-effort; a user-owned Ollama app is never killed here.
  }
}

export async function resolveLocalAiRequestModel(model: string): Promise<{ baseURL: string; model: string; engine: LocalAiEngine }> {
  const discovery = await ensureLocalAiRuntime()
  if (!discovery.available || !discovery.endpoint || !discovery.engine) {
    throw new Error(discovery.error ?? 'Local AI runtime is not running')
  }
  const resolvedModel = model === LOCAL_AI_AUTO_MODEL ? discovery.recommendedModel : model
  if (!resolvedModel) {
    throw new Error('No local AI model is available. Download a model in your local runtime and refresh.')
  }
  return { baseURL: discovery.endpoint, model: resolvedModel, engine: discovery.engine }
}

export function getLocalAiStaticModels(): LocalAiModel[] {
  const hardware = getLocalAiHardwareProfile()
  const autoModel: LocalAiModel = {
    id: LOCAL_AI_AUTO_MODEL,
    name: 'Auto local model',
    description: 'Detect and use the best running local model',
  }
  return [
    autoModel,
    { id: 'qwen3:4b', name: 'Qwen3 4B', description: describeLocalModel({ id: 'qwen3:4b', name: '', description: '' }, hardware) },
    { id: 'gemma3:4b', name: 'Gemma 3 4B', description: describeLocalModel({ id: 'gemma3:4b', name: '', description: '', supportsVision: true }, hardware), supportsVision: true },
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B', description: describeLocalModel({ id: 'llama3.2:3b', name: '', description: '' }, hardware) },
  ]
}

function getOllamaManagementEndpoint() {
  return LOCAL_AI_RUNTIME_CANDIDATES.find((candidate) => candidate.engine === 'ollama')?.managementEndpoint
    ?? 'http://127.0.0.1:11434/api'
}

function emitModelDownloadProgress(sender: WebContents | undefined, progress: LocalAiModelDownloadProgress) {
  if (!sender || sender.isDestroyed()) return
  sender.send('local-ai:modelDownloadProgress', progress)
}

function emitPullProgress(sender: WebContents | undefined, model: string, payload: OllamaPullProgress, fallbackPercent: number) {
  const totalBytes = typeof payload.total === 'number' && payload.total > 0 ? payload.total : undefined
  const completedBytes = typeof payload.completed === 'number' && payload.completed >= 0 ? payload.completed : undefined
  const percent = totalBytes && completedBytes
    ? Math.min(99, Math.max(1, Math.round((completedBytes / totalBytes) * 100)))
    : fallbackPercent
  emitModelDownloadProgress(sender, {
    model,
    status: 'running',
    percent,
    message: payload.status ?? 'Downloading model...',
    completedBytes,
    totalBytes,
  })
  return percent
}

async function readResponseText(response: Response) {
  const text = await response.text()
  if (!text.trim()) return ''
  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
    const error = typeof payload.error === 'string' ? payload.error : null
    const message = typeof payload.message === 'string' ? payload.message : null
    return error ?? message ?? text
  } catch {
    return text
  }
}

function getOllamaCliExecutable() {
  return getBundledOllamaExecutablePath() ?? (process.platform === 'win32' ? 'ollama.exe' : 'ollama')
}

function removeOllamaModelWithCli(model: string): Promise<LocalAiModelActionResult> {
  return new Promise((resolve) => {
    const child = spawn(getOllamaCliExecutable(), ['rm', model], {
      env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const append = (chunk: Buffer | string) => {
      output = `${output}${chunk.toString()}`.slice(-2000)
    }

    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', (error) => {
      resolve({ success: false, model, error: `ollama rm failed: ${error.message}` })
    })
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ success: true, model })
        return
      }
      const message = output.trim() || `exit code ${code ?? 'unknown'}`
      resolve({ success: false, model, error: `ollama rm failed: ${message}` })
    })
  })
}

/**
 * Cancel an in-flight model download. Accepts the catalog id or the Ollama model name.
 * Returns whether a download was actually running.
 */
export function cancelLocalAiModelDownload(modelId: string): { success: boolean; cancelled: boolean } {
  const name = String(modelId).trim()
  const catalogMatch = getLocalAiModelCatalog().find((model) => model.id === name || model.downloadModel === name)
  const key = catalogMatch?.downloadModel ?? name
  const controller = activeModelDownloads.get(key)
  if (!controller) return { success: true, cancelled: false }
  controller.abort()
  return { success: true, cancelled: true }
}

export async function downloadLocalAiModel(modelId: string, sender?: WebContents): Promise<LocalAiDownloadResult> {
  const hardware = getLocalAiHardwareProfile()
  const suggestedModels = getLocalAiModelCatalog(hardware)
  const benchmark = { suggestedModels }
  const target = benchmark.suggestedModels.find((model) => model.id === modelId || model.downloadModel === modelId)
  if (!target?.downloadModel) {
    return { success: false, model: modelId, error: `Unsupported local model: ${modelId}` }
  }
  const model = target.downloadModel

  // One pull per model at a time. Reserve the slot before any await.
  if (activeModelDownloads.has(model)) {
    return { success: false, model, error: 'This model is already being downloaded.' }
  }
  const controller = new AbortController()
  activeModelDownloads.set(model, controller)

  let percent = 1
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let stalled = false
  let idleLimitMs = OLLAMA_PULL_IDLE_TIMEOUT_MS
  const armIdleTimer = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      stalled = true
      controller.abort()
    }, idleLimitMs)
  }
  const fail = (message: string, extra: Partial<LocalAiDownloadResult> = {}): LocalAiDownloadResult => {
    emitModelDownloadProgress(sender, { model, status: 'error', percent, message })
    return { success: false, model, error: message, ...extra }
  }

  try {
    const ollamaProbe = await ensureOllamaRuntime(true)
    if (!ollamaProbe?.available) {
      return {
        success: false,
        model,
        error: 'Ollama is required for direct model downloads. Install Ollama or start a local runtime and try again.',
      }
    }
    if (controller.signal.aborted) return fail('Download cancelled.', { cancelled: true })

    armIdleTimer()
    const response = await fetch(`${getOllamaManagementEndpoint()}/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return fail(`Download failed (${response.status}): ${body}`)
    }

    emitModelDownloadProgress(sender, {
      model,
      status: 'running',
      percent: 1,
      message: 'Starting model download...',
    })

    // Object (not bare lets) so closure writes are visible to control-flow analysis.
    const pull = { error: null as string | null, sawSuccess: false }
    const handlePayload = (payload: OllamaPullProgress) => {
      if (payload.error) {
        pull.error = payload.error
        return
      }
      if (payload.status === 'success') pull.sawSuccess = true
      idleLimitMs = typeof payload.status === 'string' && OLLAMA_PULL_SILENT_STATUS.test(payload.status)
        ? OLLAMA_PULL_VERIFY_IDLE_TIMEOUT_MS
        : OLLAMA_PULL_IDLE_TIMEOUT_MS
      percent = emitPullProgress(sender, model, payload, percent)
    }

    reader = response.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            handlePayload(JSON.parse(trimmed) as OllamaPullProgress)
          } catch {
            // Ignore malformed stream lines; Ollama progress is best-effort.
          }
          if (pull.error) break
        }
        // Re-arm after parsing so the limit reflects the latest status (silent phases get more time).
        armIdleTimer()
        if (pull.error) break
      }
      const tail = buffer.trim()
      if (tail && !pull.error) {
        try {
          handlePayload(JSON.parse(tail) as OllamaPullProgress)
        } catch {
          // Ignore malformed trailing line.
        }
      }
    }

    if (pull.error) return fail(pull.error)

    // A stream that ends without Ollama's final {"status":"success"} line was cut off.
    if (!pull.sawSuccess) return fail('Download ended before completion. Please try again.')

    discoveryCache = null
    emitModelDownloadProgress(sender, {
      model,
      status: 'success',
      percent: 100,
      message: 'Model downloaded.',
    })
    return { success: true, model }
  } catch (error) {
    if (controller.signal.aborted) {
      return stalled
        ? fail('Download stalled with no progress. Please try again.')
        : fail('Download cancelled.', { cancelled: true })
    }
    const message = error instanceof Error ? error.message : String(error)
    return fail(`Download failed: ${message}`)
  } finally {
    clearTimeout(idleTimer)
    // Release the connection when we stop reading early (error, cancel, stall).
    try { await reader?.cancel() } catch { /* already closed */ }
    if (activeModelDownloads.get(model) === controller) activeModelDownloads.delete(model)
  }
}

function isTimeoutOrAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}

/** Ollama reports an already-removed model as HTTP 404 / "model '...' not found". */
function isModelNotFound(status: number, text: string | undefined): boolean {
  return status === 404 || /not found|does not exist/i.test(text ?? '')
}

export async function uninstallLocalAiModel(modelId: string): Promise<LocalAiModelActionResult> {
  const model = String(modelId).trim()
  if (!model) {
    return { success: false, model: modelId, error: 'Model is required.' }
  }

  if (!SAFE_MODEL_NAME.test(model)) {
    return { success: false, model, error: 'Invalid model name.' }
  }

  const ollamaProbe = await ensureOllamaRuntime(true)
  if (!ollamaProbe?.available) {
    return {
      success: false,
      model,
      error: 'Ollama is required to uninstall local models. Install Ollama or start a local runtime and try again.',
    }
  }

  const managementEndpoint = getOllamaManagementEndpoint()
  const body = JSON.stringify({ model })

  try {
    await fetch(`${managementEndpoint}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0, stream: false }),
      signal: AbortSignal.timeout(OLLAMA_UNLOAD_TIMEOUT_MS),
    })
  } catch {
    // Unloading is best-effort; delete/rm below will return the actionable error.
  }

  const apiErrors: string[] = []
  // A request that timed out or was aborted may still have been processed by Ollama, so
  // a later "model not found" then means the delete actually succeeded.
  let requestMayHaveSucceeded = false
  for (const method of ['DELETE', 'POST']) {
    try {
      const response = await fetch(`${managementEndpoint}/delete`, {
        method,
        headers: { 'content-type': 'application/json' },
        body,
        signal: AbortSignal.timeout(OLLAMA_MANAGEMENT_TIMEOUT_MS),
      })
      if (response.ok) {
        discoveryCache = null
        return { success: true, model }
      }
      const responseText = await readResponseText(response)
      if (requestMayHaveSucceeded && isModelNotFound(response.status, responseText)) {
        discoveryCache = null
        return { success: true, model }
      }
      apiErrors.push(`${method} /api/delete returned ${response.status}${responseText ? `: ${responseText}` : ''}`)
    } catch (error) {
      if (isTimeoutOrAbort(error)) requestMayHaveSucceeded = true
      const message = error instanceof Error ? error.message : String(error)
      apiErrors.push(`${method} /api/delete failed: ${message}`)
    }
  }

  const cliResult = await removeOllamaModelWithCli(model)
  if (cliResult.success || (requestMayHaveSucceeded && isModelNotFound(0, cliResult.error))) {
    discoveryCache = null
    return { success: true, model }
  }

  const detail = [...apiErrors, cliResult.error].filter(Boolean).join(' | ')
  return {
    success: false,
    model,
    error: detail ? `Uninstall failed: ${detail}` : 'Uninstall failed.',
  }
}

/**
 * Opens the vendor's runtime download page in the user's browser. Viezan does not
 * download or run an installer itself, so there is no progress to report and
 * nothing to cancel; the user installs the runtime, returns and refreshes Local AI.
 */
export async function openOllamaDownloadPage(): Promise<LocalAiInstallResult> {
  try {
    await shell.openExternal(OLLAMA_DOWNLOAD_URL)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: `Could not open the local runtime download page: ${message}`,
    }
  }

  return {
    success: true,
    manual: true,
    message: 'Opened the local runtime download page. Install it there, then return to Viezan and refresh Local AI.',
  }
}

export function registerLocalAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle('local-ai:discover', async (_event, force?: boolean) => discoverLocalAiRuntimes(Boolean(force)))
  // Explicit user action: bypass the automatic-start cool-down.
  ipcMain.handle('local-ai:ensureRuntime', async () => ensureLocalAiRuntime(true))
  ipcMain.handle('local-ai:benchmark', async () => benchmarkLocalAiSystem())
  ipcMain.handle('local-ai:downloadModel', async (event, modelId: string) => downloadLocalAiModel(modelId, event.sender))
  ipcMain.handle('local-ai:cancelModelDownload', async (_event, modelId: unknown) => {
    if (typeof modelId !== 'string' || !SAFE_MODEL_NAME.test(modelId.trim())) {
      return { success: false, cancelled: false, error: 'Invalid model name.' }
    }
    return cancelLocalAiModelDownload(modelId)
  })
  ipcMain.handle('local-ai:uninstallModel', async (_event, modelId: string) => uninstallLocalAiModel(modelId))
  // Channel name kept for preload compatibility; it only opens the download page.
  ipcMain.handle('local-ai:installOllama', async () => openOllamaDownloadPage())
}
