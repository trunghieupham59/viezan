// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelLocalAiPerformance, compareLocalAiPerformance, configureLocalAiPerformanceStorage, getLocalAiPerformanceState, isLocalAiPerformanceBusy, resetLocalAiPerformanceForTests, selectLocalAiPerformance } from '../localAiPerformance'

const MODEL = 'gemma3:4b'
const counting = Array.from({ length: 20 }, (_, i) => String(i + 1)).join(' ')
const requests: Array<{ route: string; body?: Record<string, unknown> }> = []
let ignorePlacement = false
let badQuality = false
let layers = 999
let restoreFails = false
let samples = 0
let abortOnSample = false
let resetSample = 0
let directory: string
function respond(data: unknown) { return Response.json(data) }

beforeEach(() => {
  resetLocalAiPerformanceForTests()
  requests.length = 0; ignorePlacement = false; badQuality = false; layers = 999; restoreFails = false; samples = 0; abortOnSample = false
  resetSample = 0
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viezan-performance-test-'))
  configureLocalAiPerformanceStorage(() => path.join(directory, 'performance.json'))
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const route = new URL(url).pathname
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ route, body })
    if (route === '/api/tags') return respond({ models: [{ name: MODEL }] })
    if (route === '/api/show') return respond({ model_info: { 'gemma3.block_count': 34 } })
    if (route === '/api/ps') return respond({ models: [{ name: MODEL, size: 1000, size_vram: layers === 999 || ignorePlacement ? 1000 : 500, context_length: 4096 }] })
    if (route === '/api/generate') {
      if (restoreFails && samples === 6 && body?.options?.num_ctx === 4096) throw new Error('restore refused')
      if (body?.options?.num_gpu) layers = body.options.num_gpu
      if (!body?.stream) return respond({ done: true, load_duration: 1e9 })
      samples++
      if (abortOnSample) { cancelLocalAiPerformance(); throw new DOMException('Cancelled', 'AbortError') }
      if (samples === resetSample) return new Response(`${JSON.stringify({ response: 'discard this partial output 999' })}\n${JSON.stringify({ error: 'error reading llama-server response: read tcp 127.0.0.1:50101->127.0.0.1:50102: wsarecv: An existing connection was forcibly closed by the remote host.' })}\n`)
      return new Response(`${JSON.stringify({ response: badQuality ? 'wrong' : counting })}\n${JSON.stringify({ done: true, eval_count: 40, eval_duration: layers === 999 ? 1e9 : 2e9 })}\n`)
    }
    throw new Error(`Unexpected ${url}`)
  }))
})
afterEach(() => { resetLocalAiPerformanceForTests(); vi.unstubAllGlobals(); fs.rmSync(directory, { recursive: true, force: true }) })

describe('local AI performance comparison', () => {
  it('requires explicit reload consent and an installed model before touching model state', async () => {
    await expect(compareLocalAiPerformance(MODEL, false)).rejects.toThrow('consent')
    expect(requests).toHaveLength(0)
    await expect(compareLocalAiPerformance('missing:1b', true)).rejects.toThrow('installed')
    expect(requests.some(r => r.route === '/api/generate')).toBe(false)
    expect(isLocalAiPerformanceBusy()).toBe(false)
  })
  it('measures both verified placements, restores context, and never auto-applies a winner', async () => {
    const result = await compareLocalAiPerformance(MODEL, true)
    expect(result.running).toBe(false)
    expect(result.selection).toBeUndefined()
    expect(result.comparison?.recommendedMode).toBe('gpu')
    expect(result.comparison?.results.map(r => [r.status, r.tokensPerSecond, r.gpuPercent, r.sampleCount])).toEqual([
      ['ok', 40, 100, 2], ['ok', 20, 50, 2],
    ])
    const last = requests[requests.length - 1]
    expect(last.body).toMatchObject({ model: MODEL, prompt: '', options: { num_ctx: 4096 } })
    expect(selectLocalAiPerformance(MODEL, 'hybrid').selection).toEqual({ model: MODEL, mode: 'hybrid', numGpuLayers: 17, contextLength: 2048 })
    const file = path.join(directory, 'performance.json')
    resetLocalAiPerformanceForTests(); configureLocalAiPerformanceStorage(() => file)
    expect(getLocalAiPerformanceState(MODEL).selection?.mode).toBe('hybrid')
    expect(selectLocalAiPerformance(MODEL, 'auto').selection).toBeUndefined()
  })
  it('does not call an ignored hybrid setting a successful CPU+GPU result', async () => {
    ignorePlacement = true
    const result = await compareLocalAiPerformance(MODEL, true)
    expect(result.comparison?.results[1].status).toBe('error')
    expect(() => selectLocalAiPerformance(MODEL, 'hybrid')).toThrow('successful')
  })
  it('rejects fast but incorrect output', async () => {
    badQuality = true
    const result = await compareLocalAiPerformance(MODEL, true)
    expect(result.comparison?.recommendedMode).toBeUndefined()
    expect(result.comparison?.results.every(r => r.status === 'error')).toBe(true)
  })
  it('discards a partial reset sample, keeps GPU placement and counts recovery wait in latency', async () => {
    resetSample = 2
    const result = await compareLocalAiPerformance(MODEL, true)
    const gpu = result.comparison?.results[0]
    expect(gpu).toMatchObject({ status: 'ok', tokensPerSecond: 40, qualityPassed: true, sampleCount: 2, runnerRecoveries: 1, gpuPercent: 100 })
    expect(gpu?.firstTokenMs).toBeGreaterThanOrEqual(120)
    expect(gpu?.runnerRecoveryErrors).toHaveLength(1)
    const generations = requests.filter(r => r.body?.stream)
    expect(generations.slice(0, 4).every(r => (r.body?.options as { num_gpu?: number } | undefined)?.num_gpu === 999)).toBe(true)
    expect(requests[requests.length - 1].body).toMatchObject({ options: { num_ctx: 4096 } })
  })
  it('restores model state even after cancellation', async () => {
    abortOnSample = true
    await expect(compareLocalAiPerformance(MODEL, true)).rejects.toThrow()
    expect(requests[requests.length - 1].body).toMatchObject({ options: { num_ctx: 4096 } })
    expect(isLocalAiPerformanceBusy()).toBe(false)
  })
  it('surfaces a failed restoration and discards the new comparison', async () => {
    restoreFails = true
    await expect(compareLocalAiPerformance(MODEL, true)).rejects.toThrow('restore')
    expect(getLocalAiPerformanceState(MODEL).comparison).toBeUndefined()
    expect(isLocalAiPerformanceBusy()).toBe(false)
  })
})
