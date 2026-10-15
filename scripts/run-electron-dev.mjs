import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, ['dist-electron/main.js'], {
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: true,
})

// Filter noisy Chromium GPU/Skia compositor warnings on macOS that have no
// functional impact (the renderer still works). Keep everything else verbatim.
const NOISY_PATTERNS = [
  /SharedImageManager::Produce(?:Memory|Skia|GLTexture)/,
  /Trying to Produce a (?:Memory|Skia|GLTexture) representation from a non-existent mailbox/,
  /Failed to bind .* image to a texture/,
]

function pipeFiltered(source, target) {
  let buffer = ''
  source.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let idx = buffer.indexOf('\n')
    while (idx !== -1) {
      const line = buffer.slice(0, idx + 1)
      buffer = buffer.slice(idx + 1)
      if (!NOISY_PATTERNS.some((p) => p.test(line))) target.write(line)
      idx = buffer.indexOf('\n')
    }
  })
  source.on('end', () => {
    if (buffer && !NOISY_PATTERNS.some((p) => p.test(buffer))) target.write(buffer)
  })
}

pipeFiltered(child.stdout, process.stdout)
pipeFiltered(child.stderr, process.stderr)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
