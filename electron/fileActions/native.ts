import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { FileActionError, type FileSnapshot } from './verify'

export const runFile = promisify(execFile)
export function fsBinary(appPath: string, resources: string, packaged: boolean): string {
  return packaged ? path.join(resources, 'native', 'viezan-fs') : path.join(appPath, 'native/bin/darwin/viezan-fs')
}
export function createNativeFiles(binary: string) {
  async function invoke(args: string[]): Promise<{ path?: string; running?: boolean }> {
    if (!existsSync(binary)) throw new FileActionError('native-missing')
    const { stdout } = await runFile(binary, args, { timeout: 30_000, maxBuffer: 1024 * 1024 })
    return JSON.parse(stdout)
  }
  return {
    available: () => process.platform === 'darwin' && existsSync(binary),
    async trash(target: string, expected: FileSnapshot, receipt: string) {
      const result = await invoke(['trash', target, String(expected.dev), String(expected.ino), receipt])
      if (!result.path) throw new FileActionError('failed')
      return result.path
    },
    async restore(from: string, to: string, expected: FileSnapshot) {
      await invoke(['restore', from, to, String(expected.dev), String(expected.ino)])
    },
    async running(bundle: string) { return Boolean((await invoke(['running', bundle])).running) },
    async quit(bundle: string) { await invoke(['quit', bundle]) },
  }
}
