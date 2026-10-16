import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.resolve(process.argv[2] || '')
if (!process.argv[2]) throw new Error('Usage: node scripts/stage-ollama-runtime.mjs <verified-runtime-directory>')
// Deliberately pin the binaries that passed the Windows GPU A/B experiment.
const pinned = {
  'ollama.exe': '45ACC481C0865C79ABD0DB59373483C6EDD758508813C1A79C725148C22719F1',
  'lib/ollama/llama-server.exe': '9A02EAA433EC0CCF81C4877421AF22B513E2ED25BE2D9D5B354A6C0BA8814EF9',
  'lib/ollama/llama-server-impl.dll': '7FC914661DAD560FE52EBEAF09291FAADCB9FBA8B66B8D34A029EA1BD7C2BE6C',
  'lib/ollama/cuda_v12/ggml-cuda.dll': 'ED1A847DDD1F9E3F9844F40764CDC7865B26033F079A8E65BEEA029C573F9C98',
}
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase()
for (const [file, hash] of Object.entries(pinned)) {
  if (digest(path.join(source, file)) !== hash) throw new Error(`Unverified runtime: ${file}`)
}
const destination = path.join(root, 'resources/local-ai/ollama-patched/windows/x64')
if (fs.existsSync(destination)) throw new Error('Staged runtime already exists; refusing to overwrite it')
const files = {}
function copy(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Runtime symlinks are not supported')
    if (entry.isDirectory()) copy(path.join(directory, entry.name), name)
    else if (entry.isFile()) {
      const target = path.join(destination, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(source, name), target)
      files[name] = digest(target)
    }
  }
}
copy(source)
fs.writeFileSync(path.join(destination, 'runtime.json'), JSON.stringify({
  version: '0.40.4-viezan-http-test', fix: 'windows-http-keepalive-sse-v1',
  ollamaRevision: '45e6011815c74acde6a346512856b69dd79dd22b',
  llamaRevision: 'b42b7e6d3059503dd4bed6ca5dcf342bb6379f67', files,
}, null, 2))
console.info(`Staged verified runtime: ${destination}`)
