import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'translate-app-settings'

type StoreModule = typeof import('../useAppStore')

/** Each call is one "window": a fresh module graph, hence its own store instance. */
async function openWindow(): Promise<StoreModule> {
  vi.resetModules()
  return import('../useAppStore')
}

const readState = () => JSON.parse(localStorage.getItem(KEY) ?? '{}').state ?? {}

describe('cross-window persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('a read-only window never overwrites collections written by the main window', async () => {
    // Popup opens first and hydrates an empty snapshot.
    const popup = await openWindow()
    popup.disablePersistedStoreWrites()

    // Main window then records data.
    const main = await openWindow()
    main.useAppStore.setState({
      history: [{ id: 'h1' }] as never,
      chatSessions: [{ id: 'c1', messages: [] }] as never,
      liveSessions: [{ id: 'l1' }] as never,
      dictionaryEntries: [{ id: 'd1' }] as never,
    })
    main.flushPersistedStore()
    expect(readState().history).toHaveLength(1)

    // Popup does what AIChatPopup does: ephemeral set + rehydrate + flush.
    popup.useAppStore.getState().setKeyStatus('openai', true)
    popup.useAppStore.setState({ theme: 'dark' })
    vi.advanceTimersByTime(1000)
    popup.flushPersistedStore()

    const state = readState()
    expect(state.history).toEqual([{ id: 'h1' }])
    expect(state.chatSessions).toHaveLength(1)
    expect(state.liveSessions).toEqual([{ id: 'l1' }])
    expect(state.dictionaryEntries).toEqual([{ id: 'd1' }])
    expect(state.theme).not.toBe('dark')
  })

  it('drops a write that was already pending when the window became read-only', async () => {
    const popup = await openWindow()
    popup.useAppStore.getState().setKeyStatus('openai', true)
    popup.disablePersistedStoreWrites()
    vi.advanceTimersByTime(1000)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('still hydrates from storage so the popup sees the main window settings', async () => {
    const main = await openWindow()
    main.useAppStore.setState({ selectedProvider: 'gemini' })
    main.flushPersistedStore()

    const popup = await openWindow()
    popup.disablePersistedStoreWrites()
    expect(popup.useAppStore.getState().selectedProvider).toBe('gemini')
    await popup.useAppStore.persist.rehydrate()
    expect(popup.useAppStore.getState().selectedProvider).toBe('gemini')
  })

  it('a writable window keeps persisting normally (control)', async () => {
    const main = await openWindow()
    main.useAppStore.setState({ history: [{ id: 'h1' }] as never })
    vi.advanceTimersByTime(1000)
    expect(readState().history).toEqual([{ id: 'h1' }])
  })
})
