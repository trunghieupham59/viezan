import { describe, expect, it } from 'vitest'
import { getInitialVadPolicy, hasUnreliableTranscription, quietMicSpeechThreshold, quietSpeechFrames, quietSystemSpeechThreshold, shouldFlushShortSpeech } from '../vadPolicy'
import recorded from './fixtures/quiet-hai.json'
import mic from './fixtures/quiet-mic.json'

describe('quiet microphone speech', () => {
  it.each(mic.cases)('retains the recorded $name mic envelope', ({ trace, frameMs }) => {
    expect(quietMicSpeechThreshold(trace, frameMs)).not.toBeNull()
  })
  it.each(mic.negatives)('rejects recorded $name', ({ trace, frameMs }) => {
    expect(quietMicSpeechThreshold(trace, frameMs)).toBeNull()
  })
  it('keeps a short quiet syllable on a microphone noise floor', () => {
    expect(quietMicSpeechThreshold([0.1, 0.1, 0.4, 0.6, 1.2, 1.3, 1.1, 0.7, 0.4, 0.1], 20)).not.toBeNull()
  })
  it.each([
    [0, 0, 0, 0, 0, 0],
    [0.1, 0.1, 10, 5, 0.1, 0.1],
    [0, 0, 3, 1, 0, 0, 5, 2, 0, 0, 3, 1, 0, 0],
    [0.1, 0.1, 0.5, 1.3, 0.5, 0.1], // only 60 ms
    [0.4, 0.5, 0.4, 1, 0.9, 0.7, 0.4, 0.4],
    [...Array(10).fill(0.1), ...Array(40).fill(1.5), 0.1],
    [Number.NaN, 0, 2, 1, 1, 0],
  ])('keeps silence, clicks, short noise and steady hum local: %j', (...trace) => {
    expect(quietMicSpeechThreshold(trace, 20)).toBeNull()
  })
})

describe('quiet loopback speech', () => {
  it('inspects the full interval without counting the analyser overlap twice', () => {
    const samples = new Float32Array(4096)
    samples.fill(1, 0, 256) // Old overlapping prefix must not become another speech frame.
    for (let frame = 0; frame < 4; frame++) samples.fill((frame + 1) / 128, 256 + frame * 960, 256 + (frame + 1) * 960)
    expect(quietSpeechFrames(samples, 48_000)).toEqual([1, 2, 3, 4])
  })

  it('requires sustained activity and an envelope, rather than a lone impulse in adjacent fine frames', () => {
    expect(quietSystemSpeechThreshold([0, 0, 0.3, 1, 1.1, 1.1, 0.9, 0.4, 0, 0], 20)).not.toBeNull()
    expect(quietSystemSpeechThreshold([0, 0, 30, 20, 0, 0], 20)).toBeNull()
    expect(quietSystemSpeechThreshold([0, 0, ...Array(40).fill(1), 0, 0], 20)).toBeNull()
  })
  it.each(recorded.cases)('keeps $name from the failed Windows recording without treating its two vowel frames as noise', ({ trace }) => {
    expect(quietSystemSpeechThreshold(trace)).not.toBeNull()
  })
  it.each([
    // Actual retained Opus capture decoded to float PCM, with a full 80 ms window.
    [0, 0, 0, 0.00296, 0.3725, 2.5604, 1.1159, 0.0209, 0.0043, 0.0004, 0, 0],
    [0, 0, 0, 0.7578, 1.3058, 1.9385, 0.8053, 0.8615, 0.4485, 0.5677, 0.8244, 0, 0, 0, 0, 0],
    [0, 0, 0, 0.6903, 0.8716, 4.487, 0.7474, 0.7002, 0.7831, 0.7655, 0.8558, 0.3278, 0, 0, 0, 0],
  ])('retains a captured はい trace below the old fixed threshold: %j', (...trace) => {
    expect(quietSystemSpeechThreshold(trace)).not.toBeNull()
  })
  it.each([
    [0, 0, 0, 0, 0, 0], [0, 0, 40, 0, 0, 0], [0, 0, 20, 10, 0, 0],
    [0, 0, 0.1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 1], [1, 1.1, 0.9, 1.05, 1, 1.02],
    [0, 0.05, 0.02, 0.1, 0.08], [0, 0, Number.NaN, 2, 1, 1],
  ])('does not promote silence, clicks, steady hum or invalid samples: %j', (...trace) => {
    expect(quietSystemSpeechThreshold(trace)).toBeNull()
  })
})

describe('short final speech', () => {
  const policy = getInitialVadPolicy('system')
  it('retains short speech before the normal three-frame trigger', () => {
    expect(shouldFlushShortSpeech(policy, 2, 18.2125, 1838)).toBe(true)
  })
  it('retains the recorded Japanese tail whose speech frames never form a three-frame run', () => {
    // RMS trace from the PR #101 Windows loopback reproduction (80 ms polling).
    const rms = [1.63, 1.50, 1.40, 1.51, 1.32, 1.03, 0.68, 1.76, 1.01, 18.21, 7.68, 1.68, 10.17, 2.62, 2.81, 3.07, 5.44, 1.54, 8.25, 7.64, 1.50, 1.11]
    expect(shouldFlushShortSpeech(policy, rms.filter(value => value > policy.speechRmsThreshold).length, Math.max(...rms), 1838)).toBe(true)
  })
  it.each([[0, 0, 1800], [1, 40, 1800], [2, 8, 1800], [2, 18, 160]])(
    'rejects silence, isolated clicks, weak noise or insufficient audio (%s, %s, %s)', (samples, peak, duration) => {
      expect(shouldFlushShortSpeech(policy, samples, peak, duration)).toBe(false)
    },
  )
})

describe('live recognition confidence', () => {
  it('rejects the captured microphone hallucination despite fluent token scores', () => {
    expect(hasUnreliableTranscription({ noSpeechProb: 0.798154, avgLogprob: -0.36053, compressionRatio: 0.934 })).toBe(true)
  })
  it('keeps the genuine short Japanese tail and clean Vietnamese reference scores', () => {
    expect(hasUnreliableTranscription({ noSpeechProb: 0.18949, avgLogprob: -0.9528, compressionRatio: 0.6 })).toBe(false)
    expect(hasUnreliableTranscription({ noSpeechProb: 0.103, avgLogprob: -0.4361, compressionRatio: 1.1405 })).toBe(false)
    expect(hasUnreliableTranscription({})).toBe(false)
  })
  it.each([{ noSpeechProb: Number.NaN }, { avgLogprob: Number.NEGATIVE_INFINITY }, { compressionRatio: 4 }, { avgLogprob: -3 }])('rejects unreliable supplied scores %o', scores => {
    expect(hasUnreliableTranscription(scores)).toBe(true)
  })
})
