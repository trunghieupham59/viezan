/**
 * Contract of the fan control service (`./fanControl.ts` implements it). The IPC
 * handlers, the capability provider and the runtime depend only on these types, so
 * they are tested against a fake service without the privileged helper.
 */
import type { FanCommand, FanControlState } from '../../shared/thermalApi'
import type { HelperClient } from '../helper/client'
import type { LaunchResult } from '../helper/launch'
import { isFanSensorRule } from './fanCurve'

export interface FanControlDeps {
  platform: NodeJS.Platform
  /** Path of the `viezan-fan-helper` binary (packaged: Contents/Resources/native; checkout: native/bin/darwin). */
  helperBinaryPath: string
  /** Passed to the helper as `--socket`; must start with `/var/run/viezan-fan-helper`. */
  socketPath: string
  /** The current user's uid, passed as `--uid`; the helper accepts only this peer. */
  uid: number
  launch: (options: { binaryPath: string; args: string[] }) => Promise<LaunchResult>
  createClient: (socketPath: string) => HelperClient
  /** Called whenever the state changes; the runtime forwards it to the renderer. */
  onState?: (state: FanControlState) => void
  binaryExists?: (path: string) => boolean
  connectRetryMs?: number
  connectTimeoutMs?: number
  refreshMs?: number
  log?: Pick<Console, 'warn' | 'error'>
}

/**
 * Implemented twice: `fanControl.ts` (the helper bridge: auto/fixed only, talks to the
 * helper) and `fanPolicy.ts` (wraps the bridge, adds the sensor mode). IPC and the
 * capability see the policy.
 */
export interface FanControlService {
  /** Synchronous, never throws. */
  getState: () => FanControlState
  /** Start the helper if needed and connect. Always resolves with the resulting state. */
  enable: () => Promise<FanControlState>
  /** Rejects with a readable message when not ready, the fan is unknown, or the helper refuses. */
  setFan: (fanId: string, command: FanCommand) => Promise<FanControlState>
  restoreAll: () => Promise<FanControlState>
  /** Restore every fan and drop the helper connection. */
  disable: () => Promise<FanControlState>
  /** Module stop / app quit: same as disable, swallows errors, idempotent. */
  stop: () => Promise<void>
}

/** Helper fan ids are `fan0`, `fan1`, …; the app's are the matching `smc:fan0`, `smc:fan1`, …. */
export function appFanId(helperFanId: string): string {
  return `smc:${helperFanId}`
}

export function helperFanId(appFanId: string): string | null {
  return /^smc:fan\d+$/.test(appFanId) ? appFanId.slice('smc:'.length) : null
}

export function isFanCommand(value: unknown): value is FanCommand {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (row.mode === 'auto') return true
  if (row.mode === 'fixed') return typeof row.rpm === 'number' && Number.isFinite(row.rpm) && row.rpm >= 0
  return row.mode === 'sensor' && isFanSensorRule(row)
}
