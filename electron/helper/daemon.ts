/**
 * Install, update and remove the fan helper as a launchd daemon (macOS release builds).
 *
 * A session helper needs the administrator password every time it is started; the
 * daemon needs it once. Installing copies the bundled `viezan-fan-helper` into
 * `/Library/PrivilegedHelperTools` (root-owned, so nothing the user can write is ever
 * run as root), writes the job's plist and bootstraps it; launchd keeps it running
 * across app quits, updates and restarts. See docs/plans/fan-helper-daemon.md.
 *
 * `SMAppService` would do the same without a password, but it needs a Developer ID
 * signed app; until the app is signed this path is the one that works.
 */
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import { buildOsascriptArgs, type LaunchResult, runPrivileged, shellQuote } from './launch'

export const FAN_HELPER_DAEMON_LABEL = 'com.viezan.fan-helper'
export const FAN_HELPER_DAEMON_BINARY = `/Library/PrivilegedHelperTools/${FAN_HELPER_DAEMON_LABEL}`
export const FAN_HELPER_DAEMON_PLIST = `/Library/LaunchDaemons/${FAN_HELPER_DAEMON_LABEL}.plist`
/** Must match `daemonSocketPath` in native/fanhelper/main.swift. */
export const FAN_HELPER_DAEMON_SOCKET = '/var/run/viezan-fan-helper.sock'

/**
 * `outdated`: installed, but not the binary this app ships (an app update brought a new
 * helper), or — under SMAppService — path A's job still has to be migrated.
 * `requires-approval`: SMAppService only, registered but waiting for the user in System Settings.
 */
export type HelperDaemonStatus = 'not-installed' | 'installed' | 'outdated' | 'requires-approval'

export interface HelperDaemonInstaller {
  /** `launchd` (path A, this file) or `smappservice` (path B, `smAppService.ts`). */
  kind: 'launchd' | 'smappservice'
  status: () => HelperDaemonStatus
  /** Install or replace the daemon (path A: administrator prompt; path B: register). */
  install: () => Promise<LaunchResult>
  /** Stop the daemon and remove it (path A: administrator prompt; path B: unregister). */
  uninstall: () => Promise<LaunchResult>
  /** Path B: open System Settings › Login Items so the user can approve the daemon. */
  openApproval?: () => Promise<void>
  /**
   * Path B: SHA-256 of the helper in the bundle. The daemon runs that file, so a running
   * daemon with another hash is the pre-update process and is asked to restart.
   */
  bundledSha256?: () => string
}

/** One line on purpose: the install script travels inside an AppleScript string literal. */
export function buildDaemonPlist(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `<key>Label</key><string>${FAN_HELPER_DAEMON_LABEL}</string>`,
    `<key>ProgramArguments</key><array><string>${FAN_HELPER_DAEMON_BINARY}</string><string>--daemon</string></array>`,
    '<key>RunAtLoad</key><true/>',
    // Restarted after a crash so the new process returns every fan to automatic control.
    '<key>KeepAlive</key><true/>',
    '<key>ProcessType</key><string>Interactive</string>',
    '</dict>',
    '</plist>',
  ].join('')
}

const LAUNCHCTL = '/bin/launchctl'
const SERVICE = `system/${FAN_HELPER_DAEMON_LABEL}`

/** One root shell command line: replace the binary and plist, then (re)start the job. */
export function buildInstallScript(bundledBinary: string): string {
  return [
    'set -e',
    `${LAUNCHCTL} bootout ${SERVICE} >/dev/null 2>&1 || true`,
    '/bin/mkdir -p /Library/PrivilegedHelperTools',
    `/usr/bin/install -o root -g wheel -m 0755 ${shellQuote(bundledBinary)} ${shellQuote(FAN_HELPER_DAEMON_BINARY)}`,
    `/usr/bin/printf '%s' ${shellQuote(buildDaemonPlist())} > ${shellQuote(FAN_HELPER_DAEMON_PLIST)}`,
    `/usr/sbin/chown root:wheel ${shellQuote(FAN_HELPER_DAEMON_PLIST)}`,
    `/bin/chmod 0644 ${shellQuote(FAN_HELPER_DAEMON_PLIST)}`,
    // `bootout` returns before launchd has let go of the old job; retry for a few seconds.
    'ok=0',
    `for i in 1 2 3 4 5; do if ${LAUNCHCTL} bootstrap system ${shellQuote(FAN_HELPER_DAEMON_PLIST)}; then ok=1; break; fi; /bin/sleep 1; done`,
    '[ "$ok" = 1 ]',
  ].join(' ; ')
}

export function buildUninstallScript(): string {
  return [
    `${LAUNCHCTL} bootout ${SERVICE} >/dev/null 2>&1 || true`,
    `/bin/rm -f ${shellQuote(FAN_HELPER_DAEMON_PLIST)} ${shellQuote(FAN_HELPER_DAEMON_BINARY)} ${shellQuote(FAN_HELPER_DAEMON_SOCKET)}`,
  ].join(' ; ')
}

export interface HelperDaemonInstallerDeps {
  /** The helper shipped inside this app (Contents/Resources/native/viezan-fan-helper). */
  bundledBinaryPath: string
  /** Replaceable for tests: runs osascript with administrator privileges. */
  runAsAdmin?: (script: string) => Promise<LaunchResult>
  readFile?: (path: string) => Buffer
  exists?: (path: string) => boolean
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export function createHelperDaemonInstaller({
  bundledBinaryPath,
  runAsAdmin = (script) => runPrivileged(buildOsascriptArgs(script)),
  readFile = (path) => fs.readFileSync(path),
  exists = fs.existsSync,
}: HelperDaemonInstallerDeps): HelperDaemonInstaller {
  return {
    kind: 'launchd',
    status: () => {
      if (!exists(FAN_HELPER_DAEMON_PLIST) || !exists(FAN_HELPER_DAEMON_BINARY)) return 'not-installed'
      try {
        // Comparing contents rather than version strings catches every rebuilt helper.
        return sha256(readFile(FAN_HELPER_DAEMON_BINARY)) === sha256(readFile(bundledBinaryPath)) ? 'installed' : 'outdated'
      } catch {
        return 'outdated'
      }
    },
    install: () => runAsAdmin(buildInstallScript(bundledBinaryPath)),
    uninstall: () => runAsAdmin(buildUninstallScript()),
  }
}
