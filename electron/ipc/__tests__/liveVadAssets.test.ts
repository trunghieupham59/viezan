// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('bundled microphone VAD prerequisites', () => {
  it('pairs the packaged WebAssembly binary with the loader imported from the installed runtime', () => {
    const hash = (path: string) => createHash('sha256').update(readFileSync(resolve(path))).digest('hex')
    expect(hash('public/vad/ort-wasm-simd-threaded.wasm')).toBe(hash('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'))
  })
  it('permits WebAssembly compilation while keeping JavaScript eval and remote scripts blocked', () => {
    const html = readFileSync(resolve('index.html'), 'utf8')
    const scripts = html.match(/script-src ([^;]+)/)?.[1]
    expect(scripts?.split(/\s+/)).toEqual(["'self'", "'wasm-unsafe-eval'"])
  })
})
