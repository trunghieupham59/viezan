import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export default async function verifyOllamaPackage(context) {
  if (context.electronPlatformName !== 'win32') return
  const directory = path.join(context.packager.projectDir, 'resources/local-ai/ollama-patched/windows/x64')
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json'), 'utf8'))
  if (manifest.fix !== 'windows-http-keepalive-sse-v1' || manifest.version !== '0.40.4-viezan-http-test') throw new Error('Missing verified Ollama runtime')
  for (const file of ['ollama.exe', 'lib/ollama/llama-server.exe', 'lib/ollama/llama-server-impl.dll', 'lib/ollama/cuda_v12/ggml-cuda.dll']) {
    if (typeof manifest.files?.[file] !== 'string') throw new Error(`Incomplete Ollama runtime manifest: ${file}`)
  }
  for (const [file, hash] of Object.entries(manifest.files)) {
    const resolved = path.resolve(directory, file)
    if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('Invalid runtime file path')
    const actual = createHash('sha256').update(fs.readFileSync(resolved)).digest('hex').toUpperCase()
    if (actual !== hash) throw new Error(`Ollama runtime integrity check failed: ${file}`)
  }
}
