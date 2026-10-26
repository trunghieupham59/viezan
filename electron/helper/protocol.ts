/**
 * Wire types of the privileged helper (native/fanhelper/main.swift), as described in
 * docs/plans/module-platform-and-privileged-helper.md §4.3. Newline-delimited JSON:
 * `{ id, op, args }` in, `{ id, ok, result | error }` out.
 */

/** The protocol version this build of the app speaks. A helper with another major version is refused. */
export const HELPER_PROTOCOL_VERSION = 1

export interface HelperRequest {
  id: number
  op: string
  args?: Record<string, unknown>
}

export interface HelperErrorBody {
  code: string
  message: string
}

export type HelperResponse =
  | { id: number | null; ok: true; result: unknown }
  | { id: number | null; ok: false; error: HelperErrorBody }

export interface HelperHello {
  protocol: number
  helperVersion: string
  platform: string
  /** `daemon` (launchd job, helper 1.1+) or `session`; absent from helper 1.0. */
  mode?: 'daemon' | 'session'
  pid: number
  watchdogSeconds: number
  ceilingCelsius: number
  capabilities: string[]
  /** SHA-256 of the running helper binary as it was at start (helper 1.1+). */
  binarySha256?: string
  /** True when the helper is signed with a Team ID and so checks its client's signature (helper 1.1+). */
  teamSigned?: boolean
}

export interface HelperFan {
  /** Helper-side id, `fan0`, `fan1`, … */
  id: string
  index: number
  minRpm: number
  maxRpm: number
  currentRpm: number
  targetRpm?: number
  mode: 'auto' | 'manual'
}

export interface HelperStatus {
  uptime: number
  activeOverrides: { id: string; rpm: number }[]
  lastError?: string
  lastRestoreReason?: string
  /** Increments on every restore (helper 1.1+). */
  restoreSeq?: number
}

/** The helper answered `hello` with another protocol version; retrying will not help. */
export class HelperProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HelperProtocolError'
  }
}

/** A request the helper answered with `ok: false`. */
export class HelperRequestError extends Error {
  readonly code: string
  constructor(body: HelperErrorBody) {
    super(body.message)
    this.name = 'HelperRequestError'
    this.code = body.code
  }
}

export function isHelperResponse(value: unknown): value is HelperResponse {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (!('id' in row) || typeof row.ok !== 'boolean') return false
  return row.ok ? 'result' in row : typeof row.error === 'object' && row.error !== null
}
