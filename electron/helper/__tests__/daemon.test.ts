// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  buildDaemonPlist,
  buildInstallScript,
  buildUninstallScript,
  createHelperDaemonInstaller,
  FAN_HELPER_DAEMON_BINARY,
  FAN_HELPER_DAEMON_PLIST,
  FAN_HELPER_DAEMON_SOCKET,
} from '../daemon'

const BUNDLED = "/Applications/Vie'zan.app/Contents/Resources/native/viezan-fan-helper"

describe('fan helper daemon installer', () => {
  it('describes a launchd job that runs the root-owned copy in daemon mode and is kept alive', () => {
    const plist = buildDaemonPlist()
    expect(plist).toContain('<key>Label</key><string>com.viezan.fan-helper</string>')
    expect(plist).toContain(`<string>${FAN_HELPER_DAEMON_BINARY}</string><string>--daemon</string>`)
    expect(plist).toContain('<key>KeepAlive</key><true/>')
    // Never the bundled path: the app bundle is writable by the user, the daemon runs as root.
    expect(plist).not.toContain('/Applications/')
    expect(plist).not.toContain('\n')
  })

  it('installs by copying the bundled helper as root:wheel, writing the plist, and bootstrapping with retries', () => {
    const script = buildInstallScript(BUNDLED)
    expect(script).toContain(`/usr/bin/install -o root -g wheel -m 0755 '/Applications/Vie'\\''zan.app/Contents/Resources/native/viezan-fan-helper' '${FAN_HELPER_DAEMON_BINARY}'`)
    expect(script).toContain(`> '${FAN_HELPER_DAEMON_PLIST}'`)
    expect(script.indexOf('bootout')).toBeLessThan(script.indexOf('bootstrap'))
    expect(script).toMatch(/for i in 1 2 3 4 5; do if \/bin\/launchctl bootstrap system/)
    expect(script).not.toContain('\n')
    expect(buildUninstallScript()).toContain(`/bin/rm -f '${FAN_HELPER_DAEMON_PLIST}' '${FAN_HELPER_DAEMON_BINARY}' '${FAN_HELPER_DAEMON_SOCKET}'`)
  })

  it('compares the installed binary with the bundled one to tell installed from outdated', () => {
    const files = new Map<string, Buffer>([[BUNDLED, Buffer.from('helper 1.1')]])
    const installer = createHelperDaemonInstaller({
      bundledBinaryPath: BUNDLED,
      exists: (path) => files.has(path),
      readFile: (path) => {
        const data = files.get(path)
        if (!data) throw new Error(`ENOENT ${path}`)
        return data
      },
    })
    expect(installer.status()).toBe('not-installed')
    files.set(FAN_HELPER_DAEMON_PLIST, Buffer.from('<plist/>'))
    files.set(FAN_HELPER_DAEMON_BINARY, Buffer.from('helper 1.0'))
    expect(installer.status()).toBe('outdated')
    files.set(FAN_HELPER_DAEMON_BINARY, Buffer.from('helper 1.1'))
    expect(installer.status()).toBe('installed')
  })

  it('runs install and uninstall through the administrator prompt', async () => {
    const runAsAdmin = vi.fn(async () => ({ ok: true as const }))
    const installer = createHelperDaemonInstaller({ bundledBinaryPath: BUNDLED, runAsAdmin, exists: () => false })
    await installer.install()
    await installer.uninstall()
    expect(runAsAdmin).toHaveBeenNthCalledWith(1, buildInstallScript(BUNDLED))
    expect(runAsAdmin).toHaveBeenNthCalledWith(2, buildUninstallScript())
  })
})
