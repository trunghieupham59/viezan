import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type LiveAiActionConfig, useLiveAiActions } from '../useLiveAiActions'

type ChatResult = { success: boolean; reply?: string; error?: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useLiveAiActions', () => {
  const chat = vi.fn<(request: unknown) => Promise<ChatResult>>()
  const updateLiveSession = vi.fn()
  let activeSessionId: string | null
  const getSessionId = () => activeSessionId

  const setLoading = vi.fn()
  const setOutput = vi.fn()

  function config(): LiveAiActionConfig {
    return {
      setLoading,
      setOutput,
      historyField: 'summary',
      logLabel: 'test',
      fallbackError: 'fallback failure',
      request: {} as LiveAiActionConfig['request'],
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    activeSessionId = 'session-a'
    ;(window as unknown as { api: unknown }).api = { chat }
  })

  it('shows and persists the result for the active session', async () => {
    chat.mockResolvedValue({ success: true, reply: 'summary text' })
    const { result } = renderHook(() => useLiveAiActions(updateLiveSession, getSessionId))

    await act(async () => {
      await result.current(config())
    })

    expect(setOutput).toHaveBeenLastCalledWith('summary text')
    expect(updateLiveSession).toHaveBeenCalledWith('session-a', { summary: 'summary text' })
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it('persists to the original session but does not show the result after a new session starts', async () => {
    const pending = deferred<ChatResult>()
    chat.mockReturnValue(pending.promise)
    const { result } = renderHook(() => useLiveAiActions(updateLiveSession, getSessionId))

    let run!: Promise<void>
    act(() => {
      run = result.current(config())
    })

    activeSessionId = 'session-b'
    setOutput.mockClear()

    await act(async () => {
      pending.resolve({ success: true, reply: 'late summary' })
      await run
    })

    expect(updateLiveSession).toHaveBeenCalledTimes(1)
    expect(updateLiveSession).toHaveBeenCalledWith('session-a', { summary: 'late summary' })
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('does not persist failures and hides them once the session changed', async () => {
    const pending = deferred<ChatResult>()
    chat.mockReturnValue(pending.promise)
    const { result } = renderHook(() => useLiveAiActions(updateLiveSession, getSessionId))

    let run!: Promise<void>
    act(() => {
      run = result.current(config())
    })

    activeSessionId = 'session-b'
    setOutput.mockClear()

    await act(async () => {
      pending.resolve({ success: false, error: 'boom' })
      await run
    })

    expect(updateLiveSession).not.toHaveBeenCalled()
    expect(setOutput).not.toHaveBeenCalled()
  })

  it('shows a failure for the active session without persisting it', async () => {
    chat.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useLiveAiActions(updateLiveSession, getSessionId))

    await act(async () => {
      await result.current(config())
    })

    expect(setOutput).toHaveBeenLastCalledWith('Error: fallback failure')
    expect(updateLiveSession).not.toHaveBeenCalled()
  })
})
