import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useLiveTranslate } from '../useLiveTranslate'

class FakeAudioContext {
  sampleRate = 48_000
  state = 'running'
  createAnalyser() { return { fftSize: 0, disconnect: () => undefined } }
  close() { this.state = 'closed'; return Promise.resolve() }
}

function denied(): DOMException {
  return new DOMException('Permission denied', 'NotAllowedError')
}

const originalMediaDevices = navigator.mediaDevices
let getDisplayMedia: ReturnType<typeof vi.fn>
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = { checkSttProviders: vi.fn().mockResolvedValue({ primary: 'none', available: [] }) }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  getDisplayMedia = vi.fn()
  getUserMedia = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia, getUserMedia } })
  useAppStore.setState({ liveLanguagesLocked: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices })
})

async function startIn(mode: 'mic' | 'system' | 'both') {
  const view = renderHook(() => useLiveTranslate())
  await act(async () => { view.result.current.setAudioMode(mode) })
  await act(async () => { await view.result.current.handleStart() })
  return view
}

describe('useLiveTranslate handleStart permission errors', () => {
  it("reports the Screen Recording permission when 'both' mode is denied the screen", async () => {
    getDisplayMedia.mockRejectedValue(denied())
    const { result } = await startIn('both')
    const t = TRANSLATIONS[useAppStore.getState().locale]
    expect(result.current.micError).toBe(t.live_error_screen_permission_denied)
    expect(result.current.micError).not.toBe(t.live_error_mic_denied)
  })

  it("reports the microphone when 'both' mode gets the screen but is denied the mic", async () => {
    const track = { stop: vi.fn() }
    getDisplayMedia.mockResolvedValue({ getVideoTracks: () => [], getAudioTracks: () => [track], getTracks: () => [track] })
    getUserMedia.mockRejectedValue(denied())
    vi.stubGlobal('MediaStream', class { getTracks() { return [] } })
    const { result } = await startIn('both')
    expect(result.current.micError).toBe(TRANSLATIONS[useAppStore.getState().locale].live_error_mic_denied)
  })
})

