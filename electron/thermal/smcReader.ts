/**
 * macOS reader: drives the bundled `viezan-smc` binary (native/smc/main.swift).
 *
 * Enumerating SMC keys costs about a second, so the binary is kept running in
 * `--watch` mode while snapshots are being read and it caches the key list; one line
 * of JSON arrives per interval. The child is stopped after a short idle period so a
 * one-off read does not leave a process behind. Parsing is separated so it can be
 * tested without the binary.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import type { ThermalFan, ThermalSensor, ThermalSnapshot, ThermalSupport } from '../../shared/thermalApi'
import { fanLabelFor } from './fanNames'
import type { ThermalReader } from './reader'
import { classifySmcKey } from './smcKeys'

export const SMC_BINARY_NAME = 'viezan-smc'

export interface SmcRawSensor { key: string; type?: string; celsius: number }
export interface SmcRawFan { index: number; rpm: number; min?: number; max?: number; target?: number; name?: string }
export interface SmcRawOutput { ok: boolean; error?: string; timestamp?: number; model?: string; sensors?: SmcRawSensor[]; fans?: SmcRawFan[] }

/** Where the binary lives: beside the app's resources when packaged, under native/bin in a checkout. */
export function resolveSmcBinaryPath(options: { isPackaged: boolean; resourcesPath: string; appPath: string }): string {
  return options.isPackaged
    ? path.join(options.resourcesPath, 'native', SMC_BINARY_NAME)
    : path.join(options.appPath, 'native', 'bin', 'darwin', SMC_BINARY_NAME)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Turn one JSON document from the binary into a snapshot. Throws on a reported error or malformed data. */
export function parseSmcOutput(raw: unknown, now = Date.now()): ThermalSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error('SMC reader returned no data.')
  const output = raw as SmcRawOutput
  if (output.ok === false) throw new Error(output.error || 'SMC reader failed.')

  const sensors: ThermalSensor[] = []
  for (const sensor of Array.isArray(output.sensors) ? output.sensors : []) {
    if (typeof sensor?.key !== 'string' || !isFiniteNumber(sensor.celsius)) continue
    const meaning = classifySmcKey(sensor.key)
    sensors.push({
      id: `smc:${sensor.key}`,
      code: sensor.key,
      group: meaning.group,
      ...(meaning.label ? { label: meaning.label } : {}),
      celsius: Math.round(sensor.celsius * 10) / 10,
    })
  }

  const model = typeof output.model === 'string' && output.model.length > 0 && output.model.length <= 40 ? output.model : undefined
  const rawFans = (Array.isArray(output.fans) ? output.fans : []).filter((fan) => isFiniteNumber(fan?.index) && isFiniteNumber(fan.rpm))
  const fans: ThermalFan[] = []
  for (const fan of rawFans) {
    const name = typeof fan.name === 'string' && fan.name.length > 0 && fan.name.length <= 32 ? fan.name : undefined
    const label = fanLabelFor({ model, index: fan.index, count: rawFans.length, name })
    fans.push({
      id: `smc:fan${fan.index}`,
      index: fan.index,
      ...(name ? { name } : {}),
      ...(label ? { label } : {}),
      rpm: Math.round(fan.rpm),
      ...(isFiniteNumber(fan.min) ? { minRpm: Math.round(fan.min) } : {}),
      ...(isFiniteNumber(fan.max) ? { maxRpm: Math.round(fan.max) } : {}),
      ...(isFiniteNumber(fan.target) ? { targetRpm: Math.round(fan.target) } : {}),
    })
  }

  return { timestamp: isFiniteNumber(output.timestamp) ? output.timestamp : now, source: 'smc', sensors, fans, ...(model ? { model } : {}) }
}

export interface SmcReaderOptions {
  binaryPath: string
  /** Sampling interval passed to `--watch`. */
  intervalMs?: number
  /** Stop the child after this long without a `read`. */
  idleMs?: number
  /** Give up on a read after this long. */
  timeoutMs?: number
  spawnProcess?: typeof spawn
  log?: Pick<Console, 'warn' | 'error'>
}

export function createSmcReader({
  binaryPath,
  intervalMs = 2000,
  idleMs = 10_000,
  timeoutMs = 8000,
  spawnProcess = spawn,
  log = console,
}: SmcReaderOptions): ThermalReader {
  let child: ChildProcess | null = null
  let latest: ThermalSnapshot | null = null
  let waiters: { resolve: (s: ThermalSnapshot) => void; reject: (e: Error) => void }[] = []
  let idleTimer: NodeJS.Timeout | null = null

  function settle(snapshot: ThermalSnapshot | null, error?: Error) {
    const pending = waiters
    waiters = []
    for (const waiter of pending) {
      if (snapshot) waiter.resolve(snapshot)
      else waiter.reject(error ?? new Error('SMC reader stopped.'))
    }
  }

  function stopChild() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    const current = child
    child = null
    latest = null
    if (current && current.exitCode === null && !current.killed) {
      try { current.kill('SIGTERM') } catch { /* already gone */ }
    }
    settle(null)
  }

  function touchIdle() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(stopChild, idleMs)
    idleTimer.unref?.()
  }

  function startChild() {
    const proc = spawnProcess(binaryPath, ['--watch', String(intervalMs)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    child = proc
    let stderr = ''
    proc.stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000) })
    if (proc.stdout) {
      const lines = readline.createInterface({ input: proc.stdout })
      lines.on('line', (line) => {
        if (child !== proc) return
        try {
          latest = parseSmcOutput(JSON.parse(line))
          settle(latest)
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e))
          log.warn('[Thermal] SMC reader line rejected:', error.message)
          settle(null, error)
        }
      })
    }
    proc.once('error', (e) => {
      if (child !== proc) return
      child = null
      settle(null, e)
    })
    proc.once('exit', (code) => {
      if (child !== proc) return
      child = null
      latest = null
      settle(null, new Error(stderr.trim() || `SMC reader exited with code ${code ?? 'unknown'}.`))
    })
  }

  return {
    probe: () => existsSync(binaryPath)
      ? { supported: true, source: 'smc' }
      : { supported: false, reason: 'reader-missing', detail: binaryPath },

    read: () => {
      touchIdle()
      if (!child) startChild()
      // A line younger than half an interval is good enough; otherwise wait for the next one,
      // so two polls never hand out the same sample.
      if (latest && Date.now() - latest.timestamp < intervalMs / 2) return Promise.resolve(latest)
      return new Promise<ThermalSnapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w.resolve !== wrapped.resolve)
          reject(new Error('SMC reader timed out.'))
        }, timeoutMs)
        const wrapped = {
          resolve: (s: ThermalSnapshot) => { clearTimeout(timer); resolve(s) },
          reject: (e: Error) => { clearTimeout(timer); reject(e) },
        }
        waiters.push(wrapped)
      })
    },

    dispose: stopChild,
  }
}
