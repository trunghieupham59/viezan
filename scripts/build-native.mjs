#!/usr/bin/env node
/**
 * Build the native helpers Viezan ships beside the app, as universal binaries into
 * native/bin/darwin/:
 *   • `viezan-smc` — read-only SMC sensor reader (native/smc/main.swift)
 *   • `viezan-fan-helper` — privileged fan writer, per session or as a daemon (native/fanhelper/main.swift)
 *   • `viezan-helper-ctl` — registers that daemon through SMAppService, macOS 13+ (native/helperctl/main.swift)
 * The first two share native/common/SMC.swift. Other platforms have nothing to build and exit quietly.
 *
 * Usage: node scripts/build-native.mjs [--force]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const force = process.argv.includes('--force')

if (process.platform !== 'darwin') {
  console.log('[native] nothing to build on this platform')
  process.exit(0)
}

const outDir = join(root, 'native', 'bin', 'darwin')
const common = join(root, 'native', 'common', 'SMC.swift')
const targets = [
  { name: 'viezan-fs', sources: [join(root, 'native', 'files', 'main.swift')] },
  { name: 'viezan-smc', sources: [common, join(root, 'native', 'smc', 'main.swift')] },
  { name: 'viezan-fan-helper', sources: [common, join(root, 'native', 'fanhelper', 'main.swift')] },
  // SMAppService needs macOS 13; the app runs it only there (path B, docs/plans/fan-helper-daemon.md).
  { name: 'viezan-helper-ctl', sources: [join(root, 'native', 'helperctl', 'main.swift')], minOS: '13.0' },
]

const newestMtime = (files) => Math.max(...files.map((file) => statSync(file).mtimeMs))
const stale = targets.filter(({ name, sources }) => {
  const output = join(outDir, name)
  return force || !existsSync(output) || statSync(output).mtimeMs < newestMtime(sources)
})
if (stale.length === 0) {
  console.log('[native] native helpers are up to date')
  process.exit(0)
}

try {
  execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' })
} catch {
  console.warn('[native] swiftc not found (install the Xcode Command Line Tools); skipping native helpers')
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
for (const { name, sources, minOS = '12.0' } of stale) {
  const output = join(outDir, name)
  const slices = []
  for (const arch of ['arm64', 'x86_64']) {
    const slice = join(outDir, `${name}-${arch}`)
    execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos${minOS}`, '-o', slice, ...sources], { stdio: 'inherit' })
    slices.push(slice)
  }
  execFileSync('lipo', ['-create', ...slices, '-output', output], { stdio: 'inherit' })
  for (const slice of slices) rmSync(slice, { force: true })
  console.log(`[native] built ${output}`)
}
