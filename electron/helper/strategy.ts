/**
 * How this run starts the privileged fan helper (docs/plans/fan-helper-daemon.md):
 *
 * - `session` — development checkouts: launched per session with an administrator prompt,
 *   so a development binary is never installed system-wide.
 * - `launchd` — release builds today (path A): installed once into /Library with one prompt.
 * - `smappservice` — path B: registered through SMAppService, no prompt, approved once in
 *   System Settings. Needs macOS 13 and a Developer ID signed app.
 *
 * Path B is built but switched off. Turn `SMAPPSERVICE_ENABLED` on only after the activation
 * checklist in the plan (§9): signed and notarized release, Electron fuses, real-machine QA.
 * Even then an unsigned build keeps path A, because SMAppService refuses ad-hoc signed apps.
 */
import { spawnSync } from 'node:child_process'

export const SMAPPSERVICE_ENABLED = false

export type HelperStrategy = 'session' | 'launchd' | 'smappservice'

export interface HelperStrategyInput {
  platform: NodeJS.Platform
  isPackaged: boolean
  /** `os.release()` major: 22 is macOS 13, the first with SMAppService. */
  darwinMajor: number
  /** Read lazily, only when path B is switched on (it runs `codesign`). */
  teamId: () => string | null
  enabled?: boolean
}

export function chooseHelperStrategy({ platform, isPackaged, darwinMajor, teamId, enabled = SMAPPSERVICE_ENABLED }: HelperStrategyInput): HelperStrategy {
  if (platform !== 'darwin' || !isPackaged) return 'session'
  if (enabled && darwinMajor >= 22 && teamId() !== null) return 'smappservice'
  return 'launchd'
}

/** The Team ID the app bundle is signed with, or null (ad-hoc, unsigned, or codesign failed). */
export function readTeamIdentifier(appBundlePath: string, run: (file: string, args: string[]) => string = (file, args) => {
  // codesign prints its report on stderr, also when it succeeds.
  const result = spawnSync(file, args, { encoding: 'utf8', timeout: 5000 })
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}): string | null {
  const report = run('/usr/bin/codesign', ['-dv', '--verbose=2', appBundlePath])
  const match = /^TeamIdentifier=(.+)$/m.exec(report)
  const team = match?.[1].trim()
  return team && team !== 'not set' ? team : null
}
