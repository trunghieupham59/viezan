// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOllamaRunnerConnectionReset, recoverOllamaRunnerConnection } from '../ollamaRunnerRecovery'

const reset = () => new Error('health resp: Get "http://127.0.0.1:50001/health": wsarecv: An existing connection was forcibly closed by the remote host.')
afterEach(() => vi.useRealTimers())

describe('bounded Ollama runner connection recovery', () => {
  it('recovers the exact internal reset with exponential backoff and a strict attempt limit', async () => {
    vi.useFakeTimers()
    const operation = vi.fn().mockRejectedValueOnce(reset()).mockRejectedValueOnce(reset()).mockRejectedValueOnce(reset()).mockResolvedValue('complete')
    const recovered = vi.fn()
    const result = recoverOllamaRunnerConnection(operation, new AbortController().signal, recovered)
    await vi.runAllTimersAsync()
    expect(await result).toBe('complete')
    expect(operation).toHaveBeenCalledTimes(4)
    expect(recovered).toHaveBeenCalledTimes(3)
  })
  it('still fails a persistently unhealthy runner after four attempts', async () => {
    vi.useFakeTimers()
    const operation = vi.fn().mockRejectedValue(reset())
    const checked = expect(recoverOllamaRunnerConnection(operation, new AbortController().signal, vi.fn())).rejects.toThrow('forcibly closed')
    await vi.runAllTimersAsync()
    await checked
    expect(operation).toHaveBeenCalledTimes(4)
  })
  it.each(['HTTP 500: out of memory', 'Invalid model', 'health resp: Get "https://example.com/health": connection reset by peer', 'fetch failed'])('does not retry unrelated failure: %s', async message => {
    const operation = vi.fn().mockRejectedValue(new Error(message))
    expect(isOllamaRunnerConnectionReset(new Error(message))).toBe(false)
    await expect(recoverOllamaRunnerConnection(operation, new AbortController().signal, vi.fn())).rejects.toThrow(message)
    expect(operation).toHaveBeenCalledTimes(1)
  })
  it('cancels during backoff without sending another inference', async () => {
    const controller = new AbortController()
    const operation = vi.fn().mockRejectedValue(reset())
    await expect(recoverOllamaRunnerConnection(operation, controller.signal, () => controller.abort())).rejects.toThrow()
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
