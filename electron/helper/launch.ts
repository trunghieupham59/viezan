/**
 * Start the privileged helper for this session on macOS.
 *
 * The app has no root rights, so it asks the system for them once through
 * `osascript … with administrator privileges`, which shows the standard password
 * dialog and runs the given shell command as root. The helper is started detached
 * (`&`, stdio to /dev/null) so osascript returns right away; the app then connects to
 * the helper's socket. A cancelled dialog is reported as `cancelled`, not as a failure.
 */
import { execFile } from 'node:child_process'

export type LaunchResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'failed'; message: string }

export interface LaunchOptions {
  binaryPath: string
  args: readonly string[]
  /** Replaceable for tests; runs `osascript` by default. */
  run?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
  log?: Pick<Console, 'error'>
}

/** POSIX single-quote a shell word. */
export function shellQuote(word: string): string {
  return `'${word.replace(/'/g, "'\\''")}'`
}

/** The shell command that starts the helper detached, as root. */
export function buildDetachedCommand(binaryPath: string, args: readonly string[]): string {
  return `${[binaryPath, ...args].map(shellQuote).join(' ')} >/dev/null 2>&1 &`
}

/** Escape for an AppleScript string literal. */
export function appleScriptString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildOsascriptArgs(command: string): string[] {
  return ['-e', `do shell script ${appleScriptString(command)} with administrator privileges`]
}

function defaultRun(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 120_000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = error as Error & { stderr?: string }
        wrapped.stderr = String(stderr)
        reject(wrapped)
        return
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** Run `osascript` with the given arguments; maps a dismissed password dialog to `cancelled`. */
export async function runPrivileged(osascriptArgs: string[], { run = defaultRun, log = console }: Pick<LaunchOptions, 'run' | 'log'> = {}): Promise<LaunchResult> {
  try {
    await run('osascript', osascriptArgs)
    return { ok: true }
  } catch (e) {
    const error = e as Error & { stderr?: string }
    const text = `${error.message ?? ''}\n${error.stderr ?? ''}`
    // osascript reports a dismissed dialog as "User canceled." with code -128.
    if (/-128|[Uu]ser cancel/.test(text)) return { ok: false, reason: 'cancelled', message: 'The administrator prompt was cancelled.' }
    log.error('[Helper] privileged command failed:', text.trim())
    return { ok: false, reason: 'failed', message: (error.stderr ?? error.message ?? 'The helper could not be started.').trim() }
  }
}

export function launchWithAdministratorPrivileges({ binaryPath, args, run, log }: LaunchOptions): Promise<LaunchResult> {
  return runPrivileged(buildOsascriptArgs(buildDetachedCommand(binaryPath, args)), { run, log })
}
