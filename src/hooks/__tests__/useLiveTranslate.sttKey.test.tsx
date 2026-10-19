import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store/useAppStore'
import type { SttProvider } from '../../types'
import { useLiveTranslate } from '../useLiveTranslate'

const checkSttProviders = vi.fn()

function setup(keys: { openai?: boolean; gemini?: boolean }, sttProvider: SttProvider, groq: boolean) {
  checkSttProviders.mockResolvedValue({
    primary: 'none',
    available: groq ? ['groq'] : [],
  })
  useAppStore.setState({
    sttProvider,
    keyStatus: { gemini: Boolean(keys.gemini), claude: false, openai: Boolean(keys.openai), local: false },
  })
}

async function renderLive() {
  const view = renderHook(() => useLiveTranslate())
  await act(async () => { await Promise.resolve() })
  return view
}

beforeEach(() => {
  checkSttProviders.mockReset()
  ;(window as unknown as { api: unknown }).api = { checkSttProviders }
})

describe('useLiveTranslate hasSttKey', () => {
  it('allows Start with only a Gemini key in auto mode', async () => {
    setup({ gemini: true }, 'auto', false)
    expect((await renderLive()).result.current.hasSttKey).toBe(true)
  })

  it('allows Start with only a Groq key in auto mode', async () => {
    setup({}, 'auto', true)
    expect((await renderLive()).result.current.hasSttKey).toBe(true)
  })

  it('blocks Start when no STT provider has a key', async () => {
    setup({}, 'auto', false)
    expect((await renderLive()).result.current.hasSttKey).toBe(false)
  })

  it('honours an explicit provider: Gemini selected needs a Gemini key', async () => {
    setup({ openai: true }, 'google', false)
    expect((await renderLive()).result.current.hasSttKey).toBe(false)
    setup({ gemini: true }, 'google', false)
    expect((await renderLive()).result.current.hasSttKey).toBe(true)
  })

  it('honours an explicit provider: Whisper selected needs an OpenAI key', async () => {
    setup({ gemini: true }, 'whisper', true)
    expect((await renderLive()).result.current.hasSttKey).toBe(false)
  })

  it('honours an explicit provider: Groq selected needs a Groq key', async () => {
    setup({ openai: true }, 'groq', false)
    expect((await renderLive()).result.current.hasSttKey).toBe(false)
    setup({}, 'groq', true)
    expect((await renderLive()).result.current.hasSttKey).toBe(true)
  })

  it('does not flash a missing-key state while the pre-flight check is pending', () => {
    checkSttProviders.mockReturnValue(new Promise(() => {}))
    useAppStore.setState({ sttProvider: 'groq' })
    const { result } = renderHook(() => useLiveTranslate())
    expect(result.current.hasSttKey).toBe(true)
  })
})
