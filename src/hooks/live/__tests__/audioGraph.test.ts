import { describe, expect, it, vi } from 'vitest'
import { createLiveAudioGraph } from '../audioGraph'
import { exceedsSpeechRate } from '../vadPolicy'

describe('live audio graph', () => {
  it('routes both mic and system to the same VAD/recorder signal, with exactly one output track', () => {
    const mic = {} as MediaStream, system = {} as MediaStream
    const sources = new Map([[mic, { connect: vi.fn() }], [system, { connect: vi.fn() }]])
    const mix = { gain: { value: 4 }, connect: vi.fn() }
    const track = {}
    const output = { getAudioTracks: () => [track], addTrack: vi.fn() }
    const destination = { stream: output }
    const analyser = {} as AnalyserNode
    const context = { createGain: () => mix, createMediaStreamSource: (stream: MediaStream) => sources.get(stream), createMediaStreamDestination: () => destination } as unknown as AudioContext
    expect(createLiveAudioGraph(context, [system, mic], analyser)).toBe(output)
    expect(sources.get(mic)?.connect).toHaveBeenCalledWith(mix)
    expect(sources.get(system)?.connect).toHaveBeenCalledWith(mix)
    expect(mix.connect.mock.calls).toEqual([[analyser], [destination]])
    // Even two full-scale inputs cannot sum beyond full scale.
    expect(mix.gain.value * 2).toBe(1)
    expect(output.getAudioTracks()).toHaveLength(1)
    expect(output.addTrack).not.toHaveBeenCalled()
  })

  it('accepts a real 10-second utterance of 31 words and rejects impossible speech rates', () => {
    const speech = Array(31).fill('word').join(' ')
    expect(exceedsSpeechRate(speech, 10_000)).toBe(false)
    expect(exceedsSpeechRate(speech, 2_000)).toBe(true)
  })
})
