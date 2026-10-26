/**
 * Path B of docs/plans/fan-helper-daemon.md: the fan helper as an SMAppService daemon.
 *
 * The daemon's plist ships inside the app (Contents/Library/LaunchDaemons) and its binary
 * stays in the bundle, so there is nothing to copy and no administrator prompt: the user
 * approves Viezan once in System Settings › Login Items, and every app update brings the
 * new helper with it. SMAppService is reached through `viezan-helper-ctl` (a small Swift
 * tool in Contents/MacOS), since Node cannot call it.
 *
 * It needs a Developer ID signed app, so `strategy.ts` keeps it switched off until the
 * release is signed. Same label and socket as path A: registering first removes the
 * launchd job path A installed (one last administrator prompt).
 */
import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import type { HelperDaemonInstaller, HelperDaemonStatus } from './daemon'
import type { LaunchResult } from './launch'

export const FAN_HELPER_CTL_NAME = 'viezan-helper-ctl'

export type SmAppServiceStatus = 'not-registered' | 'enabled' | 'requires-approval' | 'not-found' | 'unknown'

export interface CtlResult {
  ok: boolean
  status: SmAppServiceStatus
  error?: string
  code?: number
}

const STATUSES: readonly SmAppServiceStatus[] = ['not-registered', 'enabled', 'requires-approval', 'not-found']

/** One JSON line from `viezan-helper-ctl`; anything else is a failure with status `unknown`. */
export function parseCtlOutput(stdout: string): CtlResult {
  try {
    const row = JSON.parse(stdout.trim().split('\n').pop() ?? '') as Record<string, unknown>
    const status = STATUSES.includes(row.status as SmAppServiceStatus) ? (row.status as SmAppServiceStatus) : 'unknown'
    return {
      ok: row.ok === true,
      status,
      ...(typeof row.error === 'string' ? { error: row.error } : {}),
      ...(typeof row.code === 'number' ? { code: row.code } : {}),
    }
  } catch {
    return { ok: false, status: 'unknown', error: stdout.trim() || 'viezan-helper-ctl gave no answer.' }
  }
}

type CtlCommand = 'status' | 'register' | 'unregister' | 'open-settings'

export interface SmAppServiceInstallerDeps {
  /** Contents/MacOS/viezan-helper-ctl */
  ctlPath: string
  /** The helper inside the bundle (the daemon runs this very file). */
  bundledBinaryPath: string
  /** Path A's installer: its launchd job must go before this one can be registered. */
  legacy: HelperDaemonInstaller
  /** Replaceable for tests. `status` runs synchronously because install state is read synchronously. */
  runSync?: (command: CtlCommand) => string
  run?: (command: CtlCommand) => Promise<string>
  readFile?: (path: string) => Buffer
}

function stdoutOf(error: unknown): string {
  const stdout = (error as { stdout?: unknown })?.stdout
  return typeof stdout === 'string' ? stdout : stdout instanceof Buffer ? stdout.toString('utf8') : ''
}

export function createSmAppServiceInstaller({
  ctlPath,
  bundledBinaryPath,
  legacy,
  runSync = (command) => {
    // The tool exits 1 with its JSON answer on stdout when a call fails.
    try { return execFileSync(ctlPath, [command], { encoding: 'utf8', timeout: 5000 }) } catch (e) { return stdoutOf(e) }
  },
  run = (command) => new Promise((resolve) => {
    execFile(ctlPath, [command], { encoding: 'utf8', timeout: 30_000 }, (error, stdout) => resolve(error ? stdoutOf(error) || String(stdout ?? '') : String(stdout)))
  }),
  readFile = (path) => fs.readFileSync(path),
}: SmAppServiceInstallerDeps): HelperDaemonInstaller {
  let bundledHash: string | null = null

  const asLaunchResult = (result: CtlResult): LaunchResult => (result.ok
    ? { ok: true }
    : { ok: false, reason: 'failed', message: result.error ?? `SMAppService refused (${result.status}).` })

  return {
    kind: 'smappservice',
    status: (): HelperDaemonStatus => {
      const current = parseCtlOutput(runSync('status'))
      if (current.status === 'enabled') return 'installed'
      if (current.status === 'requires-approval') return 'requires-approval'
      // Path A's job still installed: "outdated" makes the next enable migrate it.
      return legacy.status() === 'not-installed' ? 'not-installed' : 'outdated'
    },
    install: async () => {
      if (legacy.status() !== 'not-installed') {
        const removed = await legacy.uninstall()
        if (!removed.ok) return removed
      }
      return asLaunchResult(parseCtlOutput(await run('register')))
    },
    uninstall: async () => {
      const result = asLaunchResult(parseCtlOutput(await run('unregister')))
      if (!result.ok) return result
      return legacy.status() === 'not-installed' ? result : legacy.uninstall()
    },
    openApproval: async () => {
      await run('open-settings')
    },
    bundledSha256: () => {
      bundledHash ??= createHash('sha256').update(readFile(bundledBinaryPath)).digest('hex')
      return bundledHash
    },
  }
}
