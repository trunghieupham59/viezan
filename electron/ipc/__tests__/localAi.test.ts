// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// No real GPU probing: results must not depend on the machine running the tests.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(() => {
    throw new Error('nvidia-smi not found')
  }),
}))

import {
  benchmarkLocalAiSystem,
  getLocalAiHardwareProfile,
  getModelBudgetGb,
  type LocalAiHardwareProfile,
  type LocalAiModel,
  parseNvidiaSmiOutput,
  recommendLocalModel,
  resetLocalAiStateForTests,
  scoreLocalModelForHardware,
} from '../localAi'

// RTX A1000 Laptop (6 GB VRAM) next to 32 GB of RAM and 20 threads: plenty of memory and
// cores, but little accelerator memory — the case the old RAM/CPU-only tiering got wrong.
const smallGpuHardware: LocalAiHardwareProfile = {
  platform: 'win32',
  arch: 'x64',
  cpuCount: 20,
  totalMemoryGb: 31.6,
  tier: 'balanced',
  gpuName: 'NVIDIA RTX A1000 6GB Laptop GPU',
  vramGb: 6,
  gpuMemoryKind: 'dedicated',
}

const lowHardware: LocalAiHardwareProfile = {
  platform: 'darwin',
  arch: 'arm64',
  cpuCount: 4,
  totalMemoryGb: 8,
  tier: 'balanced',
}

const powerfulHardware: LocalAiHardwareProfile = {
  platform: 'darwin',
  arch: 'arm64',
  cpuCount: 10,
  totalMemoryGb: 32,
  tier: 'max',
}

/** Route fetches by URL substring; anything unmatched fails like a closed port. */
function stubFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    const key = Object.keys(routes).find((route) => url.includes(route))
    if (!key) throw new Error(`connect ECONNREFUSED ${url}`)
    return { ok: true, status: 200, json: async () => routes[key] }
  }))
}

beforeEach(() => {
  resetLocalAiStateForTests()
  stubFetch({})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('local AI model recommendation', () => {
  it('prefers a small multilingual model on balanced hardware', () => {
    const models: LocalAiModel[] = [
      { id: 'qwen3:4b', name: 'Qwen3 4B', description: '' },
      { id: 'qwen3:30b', name: 'Qwen3 30B', description: '' },
    ]

    expect(recommendLocalModel(models, lowHardware)).toBe('qwen3:4b')
  })

  it('allows larger models on max tier hardware', () => {
    const models: LocalAiModel[] = [
      { id: 'llama3.2:1b', name: 'Llama 3.2 1B', description: '' },
      { id: 'qwen3:14b', name: 'Qwen3 14B', description: '' },
    ]

    expect(recommendLocalModel(models, powerfulHardware)).toBe('qwen3:14b')
  })

  it('penalizes embedding-only models', () => {
    const chatScore = scoreLocalModelForHardware({ id: 'gemma3:4b', name: 'Gemma 3 4B', description: '' }, lowHardware)
    const embedScore = scoreLocalModelForHardware({ id: 'nomic-embed-text', name: 'Embed', description: '' }, lowHardware)

    expect(chatScore).toBeGreaterThan(embedScore)
  })

  it('returns a benchmark with measured scores and downloadable model suggestions', async () => {
    const benchmark = await benchmarkLocalAiSystem()

    expect(benchmark.hardware.totalMemoryGb).toBeGreaterThan(0)
    expect(benchmark.metrics.cpuScore).toBeGreaterThan(0)
    expect(benchmark.metrics.memoryScore).toBeGreaterThan(0)
    expect(benchmark.metrics.durationMs).toBeGreaterThan(0)
    expect(benchmark.suggestedModels.length).toBeGreaterThan(0)
    expect(benchmark.suggestedModels[0].downloadModel).toBeTruthy()
    expect(benchmark.suggestedModels[0].estimatedSizeGb).toBeGreaterThan(0)
    expect(benchmark.recommendedModel).toBe(benchmark.suggestedModels[0].id)
  })

  it('includes multiple model families in the curated suggestions', async () => {
    const benchmark = await benchmarkLocalAiSystem()
    const suggestedIds = benchmark.suggestedModels.map((model) => model.id)

    expect(suggestedIds.some((id) => id.startsWith('llama'))).toBe(true)
    expect(suggestedIds.some((id) => id.startsWith('deepseek'))).toBe(true)
    expect(suggestedIds.some((id) => id.startsWith('qwen'))).toBe(true)
  })
})

describe('GPU-aware recommendation', () => {
  it('sizes the model budget from VRAM, not from RAM or core count', () => {
    expect(getModelBudgetGb(smallGpuHardware)).toBe(4.5)
    expect(getModelBudgetGb({ ...smallGpuHardware, vramGb: 24, tier: 'max' })).toBe(22.5)
    // CPU-only machines are capped even with lots of RAM and cores.
    expect(getModelBudgetGb({ ...smallGpuHardware, vramGb: 0, tier: 'max' })).toBe(5.5)
    // Unknown accelerator memory keeps the legacy RAM/CPU tier budget.
    expect(getModelBudgetGb({ ...smallGpuHardware, vramGb: undefined, tier: 'powerful' })).toBe(10)
  })

  it('recommends a model that fits a 6 GB GPU instead of the largest one that fits RAM', () => {
    const installed: LocalAiModel[] = [
      { id: 'qwen3:14b', name: 'Qwen3 14B', description: '' },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', description: '' },
      { id: 'gemma3:12b', name: 'Gemma 3 12B', description: '', supportsVision: true },
      { id: 'gemma3:4b', name: 'Gemma 3 4B', description: '', supportsVision: true },
    ]

    expect(recommendLocalModel(installed, smallGpuHardware)).toBe('gemma3:4b')
  })

  it('picks the least oversized model when every installed model exceeds the GPU budget', () => {
    const installed: LocalAiModel[] = [
      { id: 'qwen3:14b', name: 'Qwen3 14B', description: '' },
      { id: 'deepseek-r1:14b', name: 'DeepSeek R1 14B', description: '' },
      { id: 'gemma3:12b', name: 'Gemma 3 12B', description: '', supportsVision: true },
    ]

    expect(recommendLocalModel(installed, smallGpuHardware)).toBe('gemma3:12b')
    expect(recommendLocalModel([], smallGpuHardware)).toBeUndefined()
  })

  it('ranks a non-reasoning model above its reasoning sibling for chat', () => {
    const gemma = scoreLocalModelForHardware({ id: 'gemma3:4b', name: '', description: '' }, smallGpuHardware)
    const qwen = scoreLocalModelForHardware({ id: 'qwen3:4b', name: '', description: '' }, smallGpuHardware)

    expect(gemma).toBeGreaterThan(qwen)
  })

  it('flags models that exceed the accelerator budget as slow in the catalog', async () => {
    // Apple Silicon reports unified memory instead of a probed GPU, so the CPU-only cap below does not apply.
    if (process.platform === 'darwin' && process.arch === 'arm64') return
    const benchmark = await benchmarkLocalAiSystem()
    const byId = new Map(benchmark.suggestedModels.map((model) => [model.id, model]))

    // No runtime and no GPU in this test: CPU-only cap (5.5 GB) applies.
    expect(byId.get('qwen3:14b')?.description).toContain('May be slow')
    expect(byId.get('gemma3:4b')?.description).toContain('Recommended fit')
  })

  it('parses nvidia-smi output and keeps the largest GPU', () => {
    expect(parseNvidiaSmiOutput('NVIDIA RTX A1000 6GB Laptop GPU, 6144\n')).toEqual({
      name: 'NVIDIA RTX A1000 6GB Laptop GPU',
      vramGb: 6,
      kind: 'dedicated',
    })
    expect(parseNvidiaSmiOutput('GPU A, 8192\r\nGPU B, 24576\r\n')?.name).toBe('GPU B')
    expect(parseNvidiaSmiOutput('')).toBeNull()
    expect(parseNvidiaSmiOutput('garbage without a memory column')).toBeNull()
  })

  it('reports a CPU-only profile, capped to the balanced tier, when no GPU is found', () => {
    const profile = getLocalAiHardwareProfile()

    if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(profile.gpuMemoryKind).toBe('unified')
      return
    }
    expect(profile.vramGb).toBe(0)
    expect(profile.gpuName).toBeUndefined()
    expect(['low', 'balanced']).toContain(profile.tier)
  })
})

describe('runtime benchmark', () => {
  const MODELS = { data: [{ id: 'gemma3:12b' }] }
  const originalArch = process.arch

  // Apple Silicon reports unified GPU memory from RAM, which would make the "no GPU
  // detected" cases below depend on the host; pin a CPU-only architecture instead.
  beforeEach(() => {
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'arch', { value: originalArch, configurable: true })
  })

  it('measures real generation speed and GPU residency from Ollama, excluding model load', async () => {
    stubFetch({
      '/v1/models': MODELS,
      '/api/generate': {
        eval_count: 40,
        eval_duration: 2_000_000_000,
        load_duration: 9_000_000_000,
        total_duration: 12_000_000_000,
      },
      '/api/ps': {
        models: [{ name: 'gemma3:12b', size: 10 * 1024 ** 3, size_vram: 3.9 * 1024 ** 3 }],
      },
    })

    const { metrics } = await benchmarkLocalAiSystem()

    expect(metrics.runtimeModel).toBe('gemma3:12b')
    expect(metrics.runtimeTokensPerSecond).toBe(20)
    expect(metrics.runtimeLoadMs).toBe(9000)
    expect(metrics.runtimeLatencyMs).toBe(3000)
    expect(metrics.runtimeGpuPercent).toBe(39)
    expect(metrics.runtimeVramGb).toBe(3.9)
  })

  it('raises accelerator capacity when measured GPU residency exceeds what was detected', async () => {
    stubFetch({
      '/v1/models': MODELS,
      '/api/generate': { eval_count: 48, eval_duration: 1_000_000_000, load_duration: 0, total_duration: 1_500_000_000 },
      '/api/ps': { models: [{ name: 'gemma3:12b', size: 8 * 1024 ** 3, size_vram: 8 * 1024 ** 3 }] },
    })

    const { hardware, metrics } = await benchmarkLocalAiSystem()

    expect(metrics.runtimeGpuPercent).toBe(100)
    // Detection found no GPU (mocked); an 8 GB model fully resident proves at least 8 + reserve GB.
    expect(hardware.vramGb).toBe(9.5)
    expect(hardware.tier).toBe('powerful')
  })

  it('falls back to the OpenAI-compatible endpoint and uses the reported token usage', async () => {
    stubFetch({
      '/v1/models': MODELS,
      '/v1/chat/completions': {
        choices: [{ message: { content: 'one two three' } }],
        usage: { completion_tokens: 30 },
      },
    })

    const { metrics } = await benchmarkLocalAiSystem()

    expect(metrics.runtimeModel).toBe('gemma3:12b')
    expect(metrics.runtimeTokensPerSecond).toBeGreaterThan(0)
    expect(metrics.runtimeGpuPercent).toBeUndefined()
  })
})
