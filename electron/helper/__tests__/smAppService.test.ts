// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { FAN_HELPER_DAEMON_LABEL, FAN_HELPER_DAEMON_SOCKET, type HelperDaemonInstaller, type HelperDaemonStatus } from '../daemon'
import { createSmAppServiceInstaller, parseCtlOutput } from '../smAppService'
import { chooseHelperStrategy, readTeamIdentifier, SMAPPSERVICE_ENABLED } from '../strategy'

function fakeLegacy(initial: HelperDaemonStatus = 'not-installed') {
  let status = initial
  const legacy: HelperDaemonInstaller & { uninstall: ReturnType<typeof vi.fn> } = {
    kind: 'launchd',
    status: () => status,
    install: vi.fn(async () => ({ ok: true as const })),
    uninstall: vi.fn(async () => { status = 'not-installed'; return { ok: true as const } }),
  }
  return legacy
}

function setup(ctl: { status?: string; register?: string } = {}, legacyStatus: HelperDaemonStatus = 'not-installed') {
  const legacy = fakeLegacy(legacyStatus)
  const calls: string[] = []
  const answers: Record<string, string> = {
    status: ctl.status ?? '{"ok":true,"status":"not-registered"}',
    register: ctl.register ?? '{"ok":true,"status":"enabled"}',
    unregister: '{"ok":true,"status":"not-registered"}',
    'open-settings': '{"ok":true,"status":"requires-approval"}',
  }
  const installer = createSmAppServiceInstaller({
    ctlPath: '/Applications/Viezan.app/Contents/MacOS/viezan-helper-ctl',
    bundledBinaryPath: '/Applications/Viezan.app/Contents/Resources/native/viezan-fan-helper',
    legacy,
    runSync: (command) => answers[command],
    run: async (command) => { calls.push(command); return answers[command] },
    readFile: () => Buffer.from('helper'),
  })
  return { installer, legacy, calls }
}

describe('SMAppService installer (path B)', () => {
  it('reads the tool\'s one JSON line and treats anything else as a failure', () => {
    expect(parseCtlOutput('{"ok":true,"status":"enabled"}\n')).toEqual({ ok: true, status: 'enabled' })
    expect(parseCtlOutput('{"code":1,"error":"Operation not permitted","ok":false,"status":"not-registered"}')).toEqual({ ok: false, status: 'not-registered', error: 'Operation not permitted', code: 1 })
    expect(parseCtlOutput('')).toMatchObject({ ok: false, status: 'unknown' })
  })

  it('maps SMAppService states and reports a leftover path A job as outdated', () => {
    expect(setup({ status: '{"ok":true,"status":"enabled"}' }).installer.status()).toBe('installed')
    expect(setup({ status: '{"ok":true,"status":"requires-approval"}' }).installer.status()).toBe('requires-approval')
    expect(setup().installer.status()).toBe('not-installed')
    expect(setup({}, 'installed').installer.status()).toBe('outdated')
  })

  it('removes path A\'s job before registering, and stops when that prompt is dismissed', async () => {
    const migrating = setup({}, 'installed')
    expect(await migrating.installer.install()).toEqual({ ok: true })
    expect(migrating.legacy.uninstall).toHaveBeenCalledTimes(1)
    expect(migrating.calls).toEqual(['register'])

    const dismissed = setup({}, 'outdated')
    dismissed.legacy.uninstall.mockResolvedValueOnce({ ok: false, reason: 'cancelled', message: 'The administrator prompt was cancelled.' })
    expect(await dismissed.installer.install()).toMatchObject({ ok: false, reason: 'cancelled' })
    expect(dismissed.calls).toEqual([])

    const refused = setup({ register: '{"code":1,"error":"Operation not permitted","ok":false,"status":"not-registered"}' })
    expect(await refused.installer.install()).toEqual({ ok: false, reason: 'failed', message: 'Operation not permitted' })
  })

  it('unregisters, opens System Settings, and knows the bundled helper\'s hash', async () => {
    const { installer, calls } = setup()
    await installer.uninstall()
    await installer.openApproval?.()
    expect(calls).toEqual(['unregister', 'open-settings'])
    expect(installer.bundledSha256?.()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ships a bundle plist that names the same job, the bundled helper in daemon mode, and the app', () => {
    const plist = readFileSync(join(__dirname, '..', '..', '..', 'native', 'fanhelper', 'com.viezan.fan-helper.plist'), 'utf8')
    expect(plist).toContain(`<string>${FAN_HELPER_DAEMON_LABEL}</string>`)
    expect(plist).toContain('<key>BundleProgram</key>\n  <string>Contents/Resources/native/viezan-fan-helper</string>')
    expect(plist).toMatch(/<string>--daemon<\/string>/)
    expect(plist).toContain('<string>com.Viezan.app</string>')
    // The socket is fixed in the helper; keep the two paths' constants in step.
    expect(FAN_HELPER_DAEMON_SOCKET).toBe('/var/run/viezan-fan-helper.sock')
  })
})

describe('helper strategy', () => {
  it('stays switched off until the signed release is ready', () => {
    expect(SMAPPSERVICE_ENABLED).toBe(false)
  })

  it('keeps checkouts per session, releases on path A, and needs macOS 13 plus a Team ID for path B', () => {
    const teamId = vi.fn(() => 'ABCDE12345')
    expect(chooseHelperStrategy({ platform: 'darwin', isPackaged: false, darwinMajor: 25, teamId, enabled: true })).toBe('session')
    expect(chooseHelperStrategy({ platform: 'linux', isPackaged: true, darwinMajor: 0, teamId, enabled: true })).toBe('session')
    expect(chooseHelperStrategy({ platform: 'darwin', isPackaged: true, darwinMajor: 25, teamId })).toBe('launchd')
    expect(teamId).not.toHaveBeenCalled() // no codesign run while the switch is off
    expect(chooseHelperStrategy({ platform: 'darwin', isPackaged: true, darwinMajor: 21, teamId, enabled: true })).toBe('launchd')
    expect(chooseHelperStrategy({ platform: 'darwin', isPackaged: true, darwinMajor: 25, teamId: () => null, enabled: true })).toBe('launchd')
    expect(chooseHelperStrategy({ platform: 'darwin', isPackaged: true, darwinMajor: 25, teamId, enabled: true })).toBe('smappservice')
  })

  it('reads the Team ID from codesign\'s report, and none from an ad-hoc signature', () => {
    expect(readTeamIdentifier('/A.app', () => 'Identifier=com.Viezan.app\nTeamIdentifier=ABCDE12345\n')).toBe('ABCDE12345')
    expect(readTeamIdentifier('/A.app', () => 'Signature=adhoc\nTeamIdentifier=not set\n')).toBeNull()
    expect(readTeamIdentifier('/A.app', () => 'code object is not signed at all')).toBeNull()
  })
})
