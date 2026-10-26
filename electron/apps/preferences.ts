import { chmod, lstat, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { runFile } from '../fileActions/native'
import { FileActionError } from '../fileActions/verify'
import { readPlist } from './inventory'

/** Fail closed on unreadable domains; only a positively identified absence permits Undo. */
export function createPreferences(home: string) {
  const command = (args: string[]) => runFile('/usr/bin/defaults', args, { timeout: 15_000, maxBuffer: 1024 * 1024 })
  function validate(domain: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]{2,199}$/.test(domain) || !domain.includes('.') || domain.startsWith('com.apple.')) throw new FileActionError('protected')
  }
  const api = {
    async export(domain: string, destination: string) {
      validate(domain)
      await command(['export', domain, destination])
      await chmod(destination, 0o600)
    },
    async remove(domain: string) {
      validate(domain)
      await command(['delete', domain])
      // macOS may retain an empty cached domain. Non-empty or persisted state is not removal.
      if (await api.exists(domain)) throw new FileActionError('changed')
    },
    async exists(domain: string) {
      validate(domain)
      const persisted = () => lstat(path.join(home, 'Library/Preferences', `${domain}.plist`)).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return null
        throw e
      })
      try {
        const { stdout } = await command(['read', domain])
        if (!/^\{\s*\}$/.test(stdout.trim())) return true
        const file = path.join(home, 'Library/Preferences', `${domain}.plist`)
        return Boolean(await persisted()) && Object.keys(await readPlist(file)).length > 0
      }
      catch (error) {
        const e = error as { code?: number; stderr?: string }
        const onDisk = await persisted()
        // Permission/timeout/unknown errors are not evidence that a domain is absent.
        if (!onDisk && e.code === 1 && (e.stderr?.includes(`Domain '${domain}' not found`) || e.stderr?.includes(`Domain ${domain} does not exist`))) return false
        throw new FileActionError('unreadable')
      }
    },
    async restore(domain: string, source: string) {
      validate(domain)
      await command(['import', domain, source])
      const verification = `${source}.verify.plist`
      try {
        await command(['export', domain, verification])
        await chmod(verification, 0o600)
        if (!(await readFile(source)).equals(await readFile(verification))) throw new FileActionError('changed')
      } finally { await rm(verification, { force: true }) }
    },
  }
  return api
}
