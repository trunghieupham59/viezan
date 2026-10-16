import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { app, type BrowserWindow, type IpcMain, shell, type WebContents } from 'electron'
import { cancelLocalAiPerformance, compareLocalAiPerformance, configureLocalAiPerformancePort, configureLocalAiPerformanceStorage, getLocalAiPerformanceProfile, getLocalAiPerformanceState, isLocalAiPerformanceBusy, isLocalAiPerformanceModel, localAiProfileOptions, selectLocalAiPerformance } from './localAiPerformance'
import { allocateOllamaPort, findPatchedOllama, PATCHED_OLLAMA_VERSION } from './ollamaPatchedRuntime'
import { getOllamaServeLaunch } from './ollamaProcess'
import { createOllamaProfileFetch } from './ollamaProfileFetch'
import { isSenderWindow } from './senderGuard'

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
  /** Accelerator name when one was identified (NVIDIA via nvidia-smi, Apple Silicon). */
  gpuName?: string
  /**
   * Memory a model can occupy on the accelerator, in GB. `0` means CPU-only (no accelerator
   * identified); `undefined` means unknown and falls back to the RAM/CPU tier.
   */
  vramGb?: number
  gpuMemoryKind?: 'dedicated' | 'unified'
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
  /** Generation latency of the benchmark prompt, excluding model load time. */
  runtimeLatencyMs?: number
  /** Time Ollama spent loading the model into memory (cold start). */
  runtimeLoadMs?: number
  runtimeTokensPerSecond?: number
  /** Share of the loaded model resident in GPU memory (100 = fully on GPU). Ollama only. */
  runtimeGpuPercent?: number
  /** GPU memory the loaded model occupies, in GB. Ollama only. */
  runtimeVramGb?: number
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
  usage?: {
    completion_tokens?: number
  }
}

/** Native `/api/generate` response; durations are nanoseconds. */
interface OllamaGenerateResponse {
  eval_count?: number
  eval_duration?: number
  load_duration?: number
  total_duration?: number
}

interface OllamaPsPayload {
  models?: Array<{
    name?: string
    model?: string
    size?: number
    size_vram?: number
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
/** Includes a cold multi-GB model load, which dominates the first request. */
const LOCAL_AI_RUNTIME_BENCHMARK_TIMEOUT_MS = 45_000
const LOCAL_AI_RUNTIME_BENCHMARK_PS_TIMEOUT_MS = 2_000
const LOCAL_AI_GPU_PROBE_TIMEOUT_MS = 2_000
/** Headroom kept free on the accelerator for the KV cache, context buffers and the desktop. */
const GPU_MEMORY_RESERVE_GB = 1.5
/** Share of unified memory Metal lets the GPU address on Apple Silicon. */
const APPLE_GPU_MEMORY_SHARE = 0.65
/** Practical ceiling for CPU-only inference; larger models drop below a usable token rate. */
const CPU_ONLY_MAX_MODEL_GB = 5.5
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
/** How long Ollama keeps a chat model resident after the last request. */
const OLLAMA_KEEP_ALIVE = '30m'
/** Covers a cold multi-GB model load; the chat request would pay the same cost anyway. */
const OLLAMA_KEEP_ALIVE_REQUEST_TIMEOUT_MS = 120_000
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
let patchedCandidate: LocalAiRuntimeCandidate | null = null
let managedRuntimeGeneration = 0
/** Timestamp of the last failed managed-Ollama start (0 = none / recovered). */
let ollamaStartFailedAt = 0
/** In-flight model pulls keyed by Ollama model name, so they can be cancelled and not duplicated. */
const activeModelDownloads = new Map<string, AbortController>()
/**
 * Latest progress of every in-flight pull. The renderer (Settings) unmounts while a pull keeps
 * running here, so a remounted view reads this snapshot instead of losing the download.
 */
const activeModelDownloadProgress = new Map<string, LocalAiModelDownloadProgress>()

/** Test-only: reset module-level runtime/download bookkeeping. */
export function resetLocalAiStateForTests(): void {
  managedRuntimeGeneration++
  managedOllamaProcess = null
  patchedCandidate = null
  ollamaStartFailedAt = 0
  activeOllamaStart = null
  discoveryCache = null
  cachedGpuInfo = null
  for (const controller of activeModelDownloads.values()) controller.abort()
  activeModelDownloads.clear()
  activeModelDownloadProgress.clear()
}

export function isLocalProvider(provider: string) {
  return provider === LOCAL_PROVIDER_ID
}

interface GpuInfo {
  name?: string
  /** Usable accelerator memory in GB; 0 when no accelerator was identified. */
  vramGb: number
  kind?: 'dedicated' | 'unified'
}

const TIER_ORDER: LocalAiHardwareTier[] = ['low', 'balanced', 'powerful', 'max']

let cachedGpuInfo: GpuInfo | null = null

const roundTo1 = (value: number) => Math.round(value * 10) / 10

/**
 * Parse `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`.
 * With several GPUs the largest one is reported: a model that must be split across
 * cards is not something to recommend by default.
 */
export function parseNvidiaSmiOutput(output: string): GpuInfo | null {
  let best: GpuInfo | null = null
  for (const line of output.split(/\r?\n/)) {
    const separator = line.lastIndexOf(',')
    if (separator < 0) continue
    const name = line.slice(0, separator).trim()
    const memoryMib = Number.parseFloat(line.slice(separator + 1))
    if (!name || !Number.isFinite(memoryMib) || memoryMib <= 0) continue
    const vramGb = roundTo1(memoryMib / 1024)
    if (!best || vramGb > best.vramGb) best = { name, vramGb, kind: 'dedicated' }
  }
  return best
}

function probeNvidiaGpu(): GpuInfo | null {
  try {
    const output = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { encoding: 'utf8', timeout: LOCAL_AI_GPU_PROBE_TIMEOUT_MS, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return parseNvidiaSmiOutput(String(output ?? ''))
  } catch {
    // No NVIDIA driver / nvidia-smi on PATH: treat the machine as having no known accelerator.
    return null
  }
}

/** GPU facts never change within a session, so they are probed once. */
function detectGpuInfo(totalMemoryGb: number): GpuInfo {
  if (cachedGpuInfo) return cachedGpuInfo
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    cachedGpuInfo = { name: 'Apple Silicon', vramGb: roundTo1(totalMemoryGb * APPLE_GPU_MEMORY_SHARE), kind: 'unified' }
  } else {
    cachedGpuInfo = probeNvidiaGpu() ?? { vramGb: 0 }
  }
  return cachedGpuInfo
}

function tierFromRamAndCpu(totalMemoryGb: number, cpuCount: number): LocalAiHardwareTier {
  if (totalMemoryGb >= 32 && cpuCount >= 8) return 'max'
  if (totalMemoryGb >= 16 && cpuCount >= 6) return 'powerful'
  if (totalMemoryGb >= 8 && cpuCount >= 4) return 'balanced'
  return 'low'
}

function tierFromModelBudget(budgetGb: number): LocalAiHardwareTier {
  if (budgetGb >= 16) return 'max'
  if (budgetGb >= 8) return 'powerful'
  if (budgetGb >= 4) return 'balanced'
  return 'low'
}

function gpuModelBudgetGb(vramGb: number): number {
  return Math.max(vramGb - GPU_MEMORY_RESERVE_GB, 1)
}

/**
 * Hardware tier. Local LLM speed is decided by whether the model fits in accelerator memory,
 * not by RAM or core count: a model spilling to the CPU runs several times slower. So the tier
 * follows GPU memory when an accelerator is known, and CPU-only machines are capped.
 */
export function getLocalAiHardwareProfile(): LocalAiHardwareProfile {
  const totalMemoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
  const cpuCount = Math.max(os.cpus().length, 1)
  const ramTier = tierFromRamAndCpu(totalMemoryGb, cpuCount)
  const gpu = detectGpuInfo(totalMemoryGb)

  const tier = gpu.vramGb > 0
    ? tierFromModelBudget(gpuModelBudgetGb(gpu.vramGb))
    : TIER_ORDER[Math.min(TIER_ORDER.indexOf(ramTier), TIER_ORDER.indexOf('balanced'))]

  return {
    platform: process.platform,
    arch: process.arch,
    cpuCount,
    totalMemoryGb,
    tier,
    ...(gpu.name ? { gpuName: gpu.name } : {}),
    vramGb: gpu.vramGb,
    ...(gpu.kind ? { gpuMemoryKind: gpu.kind } : {}),
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

/**
 * Largest model, in GB of weights, that should run at a usable speed on this machine.
 * Known accelerator memory wins; CPU-only is capped; an unknown profile uses the tier.
 */
export function getModelBudgetGb(hardware: LocalAiHardwareProfile): number {
  const tierBudget = maxRecommendedModelSizeGb(hardware.tier)
  if (hardware.vramGb === undefined) return tierBudget
  if (hardware.vramGb <= 0) return Math.min(tierBudget, CPU_ONLY_MAX_MODEL_GB)
  return gpuModelBudgetGb(hardware.vramGb)
}

/** Reasoning models emit a long hidden "thinking" pass before answering, which hurts chat latency. */
function isReasoningModel(modelId: string): boolean {
  return /qwen3(?!-vl|-coder)|deepseek-r1|\br1\b|qwq|magistral/i.test(modelId)
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
  const budgetGb = getModelBudgetGb(hardware)
  let score = 100

  // A model that spills out of accelerator memory runs several times slower, so overshoot is
  // penalised far harder than the per-GB quality bonus a larger model earns inside the budget.
  if (sizeGb > budgetGb) score -= (sizeGb - budgetGb) * 45
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
  if (isReasoningModel(id)) score -= 30

  return score
}

export function recommendLocalModel(models: LocalAiModel[], hardware = getLocalAiHardwareProfile()): string | undefined {
  if (models.length === 0) return undefined
  // Highest score wins even when every installed model overshoots the budget: the least
  // oversized model is the right pick, not whichever happens to be listed first.
  return models.reduce((best, model) =>
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

const BENCHMARK_PROMPT = 'Reply with exactly eight words about local AI performance.'
/** Enough tokens for a stable rate while keeping reasoning models from thinking for long. */
const BENCHMARK_MAX_TOKENS = 48
const NS_PER_MS = 1_000_000
const NS_PER_SECOND = 1_000_000_000

/** Which share of the loaded model Ollama actually placed in GPU memory. */
async function readOllamaGpuResidency(model: string): Promise<Partial<LocalAiBenchmarkMetrics>> {
  try {
    const payload = await fetchJsonWithTimeout(
      `${getOllamaManagementEndpoint()}/ps`,
      LOCAL_AI_RUNTIME_BENCHMARK_PS_TIMEOUT_MS,
    ) as OllamaPsPayload
    const loaded = payload.models?.find((item) => item.name === model || item.model === model)
    const size = loaded?.size ?? 0
    if (!loaded || size <= 0) return {}
    const vram = Math.min(Math.max(loaded.size_vram ?? 0, 0), size)
    return {
      runtimeGpuPercent: Math.round((vram / size) * 100),
      runtimeVramGb: roundTo1(vram / 1024 ** 3),
    }
  } catch {
    return {}
  }
}

/**
 * Ollama reports exact token counts and phase timings, so speed excludes the cold model load
 * and prompt processing that a wall-clock measurement would fold in.
 */
async function runOllamaNativeBenchmark(model: string): Promise<Partial<LocalAiBenchmarkMetrics>> {
  try {
    const response = await fetch(`${getOllamaManagementEndpoint()}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(LOCAL_AI_RUNTIME_BENCHMARK_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        prompt: BENCHMARK_PROMPT,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_predict: BENCHMARK_MAX_TOKENS, temperature: 0 },
      }),
    })
    if (!response.ok) return {}
    const payload = await response.json() as OllamaGenerateResponse
    const evalCount = payload.eval_count ?? 0
    const evalNs = payload.eval_duration ?? 0
    if (evalCount <= 0 || evalNs <= 0) return {}
    const loadNs = payload.load_duration ?? 0
    const generationNs = Math.max((payload.total_duration ?? 0) - loadNs, evalNs)
    return {
      runtimeModel: model,
      runtimeTokensPerSecond: roundTo1(evalCount / (evalNs / NS_PER_SECOND)),
      runtimeLatencyMs: Math.round(generationNs / NS_PER_MS),
      runtimeLoadMs: Math.round(loadNs / NS_PER_MS),
      ...(await readOllamaGpuResidency(model)),
    }
  } catch {
    return {}
  }
}

/** Fallback for LM Studio / llama.cpp, which expose only the OpenAI-compatible API. */
async function runOpenAiCompatibleBenchmark(endpoint: string, model: string): Promise<Partial<LocalAiBenchmarkMetrics>> {
  const startedAt = performance.now()
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LOCAL_AI_PLACEHOLDER_KEY}` },
      signal: AbortSignal.timeout(LOCAL_AI_RUNTIME_BENCHMARK_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a concise local AI benchmark responder.' },
          { role: 'user', content: BENCHMARK_PROMPT },
        ],
        max_tokens: BENCHMARK_MAX_TOKENS,
        temperature: 0,
        stream: false,
      }),
    })
    if (!response.ok) return {}
    const payload = await response.json() as OpenAiChatCompletion
    const content = payload.choices?.[0]?.message?.content ?? ''
    const latencyMs = Math.max(performance.now() - startedAt, 1)
    const tokens = payload.usage?.completion_tokens || estimateTokenCount(content)
    return {
      runtimeModel: model,
      runtimeLatencyMs: Math.round(latencyMs),
      runtimeTokensPerSecond: roundTo1((tokens / latencyMs) * 1000),
    }
  } catch {
    return {}
  }
}

async function runRuntimeBenchmark(discovery: LocalAiDiscoveryResult): Promise<Partial<LocalAiBenchmarkMetrics>> {
  if (!discovery.available || !discovery.endpoint) return {}
  const model = discovery.recommendedModel ?? discovery.models[0]?.id
  if (!model) return {}

  if (discovery.engine === 'ollama') {
    const native = await runOllamaNativeBenchmark(model)
    if (native.runtimeTokensPerSecond) return native
  }
  return runOpenAiCompatibleBenchmark(discovery.endpoint, model)
}

/**
 * Measured GPU residency is hard evidence of accelerator capacity. When it exceeds what
 * detection found (an AMD/Intel GPU, say), trust it — as a lower bound, since the loaded
 * model may simply have been smaller than the card.
 */
function refineHardwareWithRuntime(
  hardware: LocalAiHardwareProfile,
  metrics: Partial<LocalAiBenchmarkMetrics>,
): LocalAiHardwareProfile {
  if (!metrics.runtimeVramGb || metrics.runtimeVramGb <= 0) return hardware
  const measuredVramGb = roundTo1(metrics.runtimeVramGb + GPU_MEMORY_RESERVE_GB)
  if (measuredVramGb <= (hardware.vramGb ?? 0)) return hardware
  return {
    ...hardware,
    vramGb: measuredVramGb,
    gpuMemoryKind: hardware.gpuMemoryKind ?? 'dedicated',
    tier: tierFromModelBudget(gpuModelBudgetGb(measuredVramGb)),
  }
}

export async function benchmarkLocalAiSystem(): Promise<LocalAiBenchmarkResult> {
  const benchmarkStartedAt = performance.now()
  const baseHardware = getLocalAiHardwareProfile()
  const cpuScore = runCpuBenchmark()
  const memoryScore = runMemoryBenchmark()
  const combinedScore = Math.round(cpuScore * 0.65 + memoryScore * 0.35)
  const runtimeMetrics = await runRuntimeBenchmark(await discoverLocalAiRuntimes(true))
  const hardware = refineHardwareWithRuntime(baseHardware, runtimeMetrics)
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

function describeLocalModel(model: LocalAiModel, hardware: LocalAiHardwareProfile): string {
  if (model.id === LOCAL_AI_AUTO_MODEL) return 'Auto-select best local model'
  const sizeGb = getModelSizeHintGb(model.id, model.sizeBytes)
  const fit = sizeGb <= getModelBudgetGb(hardware) ? 'Recommended fit' : 'May be slow'
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
  if (getPatchedOllamaExecutable()) return ensureOllamaRuntime(force)
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
  if (patchedCandidate) return patchedCandidate
  return LOCAL_AI_RUNTIME_CANDIDATES.find((candidate) => candidate.engine === 'ollama') ?? LOCAL_AI_RUNTIME_CANDIDATES[0]
}

function getPatchedOllamaExecutable() {
  return findPatchedOllama(process.resourcesPath, process.defaultApp === true ? path.resolve('resources') : undefined)
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

function startOllamaProcess(command: string, options: { env: NodeJS.ProcessEnv; trackManaged?: boolean }) {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const launch = getOllamaServeLaunch(command, options.env)
    const child = spawn(launch.command, launch.args, launch.options)
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
    if (patchedCandidate) {
      if (!isManagedOllamaAlive()) return null
      try {
        const version = await fetchJsonWithTimeout(`${candidate.managementEndpoint}/version`) as { version?: string }
        if (version.version !== PATCHED_OLLAMA_VERSION) return null
      } catch { await delay(LOCAL_AI_RUNTIME_START_POLL_MS); continue }
    }
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
    const started = await startOllamaProcess(executablePath, {
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
  const started = await startOllamaProcess(executable, {
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
  const patched = getPatchedOllamaExecutable()
  if (patched) {
    if (!force && isInOllamaStartCooldown()) return createUnavailableLocalAiResult(OLLAMA_UNAVAILABLE_MESSAGE)
    if (!isManagedOllamaAlive()) {
      const generation = managedRuntimeGeneration
      const port = await allocateOllamaPort()
      if (generation !== managedRuntimeGeneration) return createUnavailableLocalAiResult('Local AI startup was cancelled')
      patchedCandidate = { engine: 'ollama', endpoint: `http://127.0.0.1:${port}/v1`, managementEndpoint: `http://127.0.0.1:${port}/api` }
      configureLocalAiPerformancePort(port)
      discoveryCache = null
      await startOllamaProcess(patched, { env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` }, trackManaged: true })
    }
    const result = await waitForOllamaRuntime()
    ollamaStartFailedAt = result ? 0 : Date.now()
    // Never silently route back to the unpatched external server on failure.
    return result ?? createUnavailableLocalAiResult('The Viezan local AI runtime could not start. Retry Local AI.')
  }
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
  const patched = getPatchedOllamaExecutable()
  const existing = !patched ? await probeLocalAiRuntime(getOllamaRuntimeCandidate()) : null
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
 * Prefer the verified app-owned Windows runtime when packaged. Otherwise reuse
 * a detected engine before starting Ollama. `force` bypasses the start cooldown.
 */
export async function ensureLocalAiRuntime(force = false): Promise<LocalAiDiscoveryResult> {
  if (getPatchedOllamaExecutable()) return ensureOllamaRuntime(force)
  const discovered = await discoverLocalAiRuntimes(true)
  if (discovered.available) return discovered

  return ensureOllamaRuntime(force)
}

export function stopManagedLocalAiRuntime() {
  managedRuntimeGeneration++
  const child = managedOllamaProcess
  managedOllamaProcess = null
  if (!child?.pid) return
  const pid = child.pid

  if (process.platform === 'win32') {
    // process.kill(-pid) is POSIX-only. taskkill /T /F ends the whole tree
    // (the supervisor, ollama.exe, and its runners); argv array, no shell.
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

export async function resolveLocalAiRequestModel(model: string): Promise<{ baseURL: string; model: string; engine: LocalAiEngine; fetch?: typeof fetch }> {
  if (isLocalAiPerformanceBusy()) throw new Error('Local AI comparison is running. Wait for it to finish or cancel it.')
  const discovery = await ensureLocalAiRuntime()
  if (!discovery.available || !discovery.endpoint || !discovery.engine) {
    throw new Error(discovery.error ?? 'Local AI runtime is not running')
  }
  const resolvedModel = model === LOCAL_AI_AUTO_MODEL ? discovery.recommendedModel : model
  if (!resolvedModel) {
    throw new Error('No local AI model is available. Download a model in your local runtime and refresh.')
  }
  const configuredFetch = discovery.engine === 'ollama' ? createOllamaProfileFetch(discovery.endpoint, getLocalAiPerformanceProfile(resolvedModel)) : undefined
  return { baseURL: discovery.endpoint, model: resolvedModel, engine: discovery.engine, ...(configuredFetch ? { fetch: configuredFetch } : {}) }
}

/**
 * Ollama's OpenAI-compatible `/v1` endpoint ignores `keep_alive`, so models fall out of
 * memory after the 5-minute default and the next chat pays a multi-second reload. An empty
 * native `/api/generate` call loads the model (a no-op when already loaded) and extends its
 * residency. Best-effort: a failure here must never block the chat request itself.
 */
export async function keepOllamaModelLoaded(model: string, signal?: AbortSignal): Promise<void> {
  const timeout = AbortSignal.timeout(OLLAMA_KEEP_ALIVE_REQUEST_TIMEOUT_MS)
  try {
    await fetch(`${getOllamaManagementEndpoint()}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: OLLAMA_KEEP_ALIVE, stream: false, options: localAiProfileOptions(getLocalAiPerformanceProfile(model)) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch {
    // Warm-up only; the chat request surfaces any real runtime error.
  }
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
  return getOllamaRuntimeCandidate()?.managementEndpoint
    ?? 'http://127.0.0.1:11434/api'
}

/** Snapshot of the pulls currently running, for a renderer that (re)mounted mid-download. */
export function getLocalAiActiveDownloads(): LocalAiModelDownloadProgress[] {
  return [...activeModelDownloads.keys()].map((model) => (
    activeModelDownloadProgress.get(model)
      ?? { model, status: 'running', percent: 1, message: 'Downloading model...' }
  ))
}

function emitModelDownloadProgress(sender: WebContents | undefined, progress: LocalAiModelDownloadProgress) {
  if (progress.status === 'running') activeModelDownloadProgress.set(progress.model, progress)
  else activeModelDownloadProgress.delete(progress.model)
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
  return getPatchedOllamaExecutable() ?? getBundledOllamaExecutablePath() ?? (process.platform === 'win32' ? 'ollama.exe' : 'ollama')
}

function removeOllamaModelWithCli(model: string): Promise<LocalAiModelActionResult> {
  return new Promise((resolve) => {
    const child = spawn(getOllamaCliExecutable(), ['rm', model], {
      env: { ...process.env, OLLAMA_HOST: new URL(getOllamaManagementEndpoint()).host },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
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
    if (activeModelDownloads.get(model) === controller) {
      activeModelDownloads.delete(model)
      activeModelDownloadProgress.delete(model)
    }
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

export function registerLocalAiHandlers(ipcMain: IpcMain, getMainWindow?: () => BrowserWindow | null) {
  configureLocalAiPerformanceStorage(() => path.join(app.getPath('userData'), 'local-ai-performance.json'))
  const trusted = (event: Parameters<typeof isSenderWindow>[0]) => Boolean(getMainWindow && isSenderWindow(event, getMainWindow))
  ipcMain.handle('local-ai:performance:get', (event, model: unknown) => {
    if (!trusted(event) || !isLocalAiPerformanceModel(model)) throw new Error('Invalid performance settings request')
    return getLocalAiPerformanceState(model)
  })
  ipcMain.handle('local-ai:performance:compare', async (event, request: unknown) => {
    const r = request as { model?: unknown; consentToReload?: unknown } | null
    if (!trusted(event) || !r || !isLocalAiPerformanceModel(r.model) || r.consentToReload !== true) throw new Error('Model reload consent is required')
    const runtime = await ensureOllamaRuntime(true)
    if (!runtime.available) throw new Error(runtime.error)
    return compareLocalAiPerformance(r.model, true)
  })
  ipcMain.handle('local-ai:performance:select', (event, model: unknown, mode: unknown) => {
    if (!trusted(event) || !isLocalAiPerformanceModel(model) || !['auto', 'gpu', 'hybrid'].includes(String(mode))) throw new Error('Invalid performance selection')
    return selectLocalAiPerformance(model, mode as 'auto' | 'gpu' | 'hybrid')
  })
  ipcMain.handle('local-ai:performance:cancel', event => {
    if (!trusted(event)) throw new Error('Untrusted sender')
    cancelLocalAiPerformance()
  })
  ipcMain.handle('local-ai:discover', async (_event, force?: boolean) => discoverLocalAiRuntimes(Boolean(force)))
  // Explicit user action: bypass the automatic-start cool-down.
  ipcMain.handle('local-ai:ensureRuntime', async () => ensureLocalAiRuntime(true))
  ipcMain.handle('local-ai:benchmark', async () => benchmarkLocalAiSystem())
  ipcMain.handle('local-ai:downloadModel', async (event, modelId: string) => downloadLocalAiModel(modelId, event.sender))
  ipcMain.handle('local-ai:getActiveDownloads', async () => getLocalAiActiveDownloads())
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
