#!/usr/bin/env node
/** Offline regression: real Chromium Opus decoding, PCM preparation and VAD.
 * npm dependencies/browser must already exist. No devices, API or downloads.
 * node scripts/replay-live-audio.mjs [--output report.json]
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const { values } = parseArgs({ options: { output: { type: 'string' } } })
const root = fileURLToPath(new URL('../', import.meta.url))
const compiled = await build({
  stdin: { contents: "export {quietSpeechFrames, quietSystemSpeechThreshold} from './src/hooks/live/vadPolicy'; export {prepareSpeechAudio} from './src/hooks/live/prepareSpeechAudio'", resolveDir: root, loader: 'ts' },
  bundle: true, write: false, format: 'iife', globalName: 'LiveReplay',
})
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.route('**/*', route => route.abort())
  await page.addScriptTag({ content: compiled.outputFiles[0].text })
  const results = []
  for (const name of ['quiet-hai-003.webm', 'quiet-hai-006.webm']) {
    const bytes = await readFile(new URL(`../src/hooks/live/__tests__/fixtures/${name}`, import.meta.url))
    results.push(await page.evaluate(async ({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const phases = []
      for (const sampleRate of [44_100, 48_000]) {
        const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes.buffer.slice(0))
        const pcm = decoded.getChannelData(0)
        const interval = Math.round(sampleRate * 0.08)
        const fft = 2 ** Math.ceil(Math.log2(interval))
        for (let offsetMs = 0; offsetMs < 80; offsetMs += 10) {
          const trace = []
          let accepted = false
          for (let offset = Math.round(offsetMs * sampleRate / 1000); offset + fft <= pcm.length; offset += interval) {
            trace.push(...LiveReplay.quietSpeechFrames(pcm.subarray(offset, offset + fft), sampleRate))
            accepted ||= LiveReplay.quietSystemSpeechThreshold(trace, 20) !== null
          }
          phases.push({ sampleRate, offsetMs, accepted })
        }
      }
      const start = performance.now()
      const prepared = await LiveReplay.prepareSpeechAudio(new Blob([bytes], { type: 'audio/webm' }))
      const elapsedMs = Math.round(performance.now() - start)
      const pcm = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await prepared.arrayBuffer())
      let peak = 0
      for (const value of pcm.getChannelData(0)) peak = Math.max(peak, Math.abs(value))
      return { name, phases, outputSeconds: pcm.duration, outputChannels: pcm.numberOfChannels, outputSampleRate: pcm.sampleRate, peak, preparationMs: elapsedMs,
        pass: phases.every(p => p.accepted) && Math.abs(pcm.duration - 1.26) < 0.001 && pcm.numberOfChannels === 1 && peak <= 0.901 }
    }, { name, base64: bytes.toString('base64') }))
  }
  const negatives = await page.evaluate(() => {
    const sampleRate = 48000
    const signals = {
      silence: new Float32Array(sampleRate),
      click: Float32Array.from({ length: sampleRate }, (_, i) => i >= 4000 && i < 4010 ? 0.9 : 0),
      twoClicks: Float32Array.from({ length: sampleRate }, (_, i) => (i >= 4000 && i < 4010) || (i >= 6900 && i < 6910) ? 0.9 : 0),
      hum: Float32Array.from({ length: sampleRate }, (_, i) => Math.sin(i * 2 * Math.PI * 120 / sampleRate) * 0.01),
    }
    return Object.entries(signals).map(([name, samples]) => {
      const trace = []
      let accepted = false
      for (let offset = 0; offset + 4096 <= samples.length; offset += 3840) {
        trace.push(...LiveReplay.quietSpeechFrames(samples.subarray(offset, offset + 4096), sampleRate))
        accepted ||= LiveReplay.quietSystemSpeechThreshold(trace, 20) !== null
      }
      return { name, pass: !accepted }
    })
  })
  const report = { scope: 'Offline Chromium replay; no recognition or semantic accuracy claim', results, negatives }
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if ([...results, ...negatives].some(r => !r.pass)) process.exitCode = 1
} finally {
  await browser.close()
}
