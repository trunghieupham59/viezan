import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export const PATCHED_OLLAMA_VERSION = '0.40.4-viezan-http-test'
export const PATCHED_RUNTIME_DIRECTORY = 'local-ai/ollama-patched/windows/x64'

/** Only application resources may select an executable; never renderer input or PATH. */
export function findPatchedOllama(resources: string | undefined, developmentRoot?: string): string | null {
  if (process.platform !== 'win32' || process.arch !== 'x64') return null
  const roots = [resources, developmentRoot].filter((root): root is string => Boolean(root))
  for (const root of roots) {
    const directory = path.join(root, PATCHED_RUNTIME_DIRECTORY)
    if (!fs.existsSync(directory)) continue
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'runtime.json'), 'utf8'))
    if (manifest.version !== PATCHED_OLLAMA_VERSION || manifest.fix !== 'windows-http-keepalive-sse-v1') {
      throw new Error('Invalid Viezan Ollama runtime manifest')
    }
    for (const file of ['ollama.exe', 'lib/ollama/llama-server.exe', 'lib/ollama/llama-server-impl.dll', 'lib/ollama/cuda_v12/ggml-cuda.dll']) {
      if (!fs.statSync(path.join(directory, file)).isFile()) throw new Error('Incomplete Viezan Ollama runtime')
    }
    return path.join(directory, 'ollama.exe')
  }
  return null
}

export async function allocateOllamaPort(): Promise<number> {
  const server = net.createServer()
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}
