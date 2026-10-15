// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '2.0.2',
    isPackaged: true,
    getPath: () => '/tmp',
  },
  net: {
    fetch: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    logger: null,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}))

import {
  buildMacGithubReleaseFromTag,
  buildMacInstallScript,
  isMissingUpdateMetadataError,
  isNewerVersion,
  isTrustedGithubDownloadUrl,
  parseLatestGithubTagFromUrl,
  resolveMacBundlePath,
  selectMacInstallDestination,
} from '../updater'

describe('updater helpers', () => {
  it('compares newer release versions', () => {
    expect(isNewerVersion('2.0.3', '2.0.2')).toBe(true)
    expect(isNewerVersion('v2.0.2', '2.0.2')).toBe(false)
    expect(isNewerVersion('2.0.1', '2.0.2')).toBe(false)
  })

  it('parses the tag from the public GitHub latest redirect URL', () => {
    expect(parseLatestGithubTagFromUrl('https://github.com/trunghieupham59/viezan/releases/tag/v2.0.3')).toBe('v2.0.3')
    expect(parseLatestGithubTagFromUrl('https://github.com/trunghieupham59/other/releases/tag/v2.0.3')).toBeNull()
    expect(parseLatestGithubTagFromUrl('not a url')).toBeNull()
  })

  it('builds deterministic macOS DMG release metadata from a tag', () => {
    expect(buildMacGithubReleaseFromTag('v2.0.3', 'arm64')).toEqual({
      version: '2.0.3',
      downloadUrl: 'https://github.com/trunghieupham59/viezan/releases/download/v2.0.3/Viezan-2.0.3-arm64.dmg',
      assetName: 'Viezan-2.0.3-arm64.dmg',
    })
    expect(buildMacGithubReleaseFromTag('invalid', 'arm64')).toBeNull()
  })

  it('builds a macOS installer helper that swaps the app in with a backup after the current process exits', () => {
    const script = buildMacInstallScript()

    expect(script).toContain('hdiutil attach "$DMG_PATH"')
    expect(script).toContain('kill -0 "$APP_PID"')
    // Destination comes from the running bundle (3rd arg), defaulting to /Applications
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion
    expect(script).toContain('DEST_PATH="${3:-/Applications/Viezan.app}"')
    // Copy to a staging path first so a failed copy never removes the installed app
    expect(script).toContain('ditto "$SOURCE_PATH" "$STAGE_PATH"')
    expect(script).not.toContain('rm -rf "$DEST_PATH"')
    expect(script).toContain('mv "$DEST_PATH" "$BACKUP_PATH"')
    expect(script).toContain('mv "$BACKUP_PATH" "$DEST_PATH"')
    expect(script.indexOf('ditto "$SOURCE_PATH" "$STAGE_PATH"')).toBeLessThan(script.indexOf('mv "$DEST_PATH" "$BACKUP_PATH"'))
    expect(script).toContain('open "$DEST_PATH"')
  })

  it('derives the running .app bundle from the executable path', () => {
    expect(resolveMacBundlePath('/Applications/Viezan.app/Contents/MacOS/Viezan')).toBe('/Applications/Viezan.app')
    expect(resolveMacBundlePath('/Users/me/Apps/Viezan.app/Contents/MacOS/Viezan')).toBe('/Users/me/Apps/Viezan.app')
    expect(resolveMacBundlePath('/usr/local/bin/electron')).toBeNull()
    expect(resolveMacBundlePath('/.app/Contents/MacOS/x')).toBeNull()
    expect(resolveMacBundlePath('relative/Viezan.app/Contents/MacOS/Viezan')).toBeNull()
  })

  it('falls back to /Applications for read-only or unwritable bundle locations', () => {
    const writable = () => true
    const readOnly = () => false
    expect(selectMacInstallDestination('/Users/me/Apps/Viezan.app/Contents/MacOS/Viezan', writable)).toBe('/Users/me/Apps/Viezan.app')
    expect(selectMacInstallDestination('/Applications/Viezan.app/Contents/MacOS/Viezan', writable)).toBe('/Applications/Viezan.app')
    // Gatekeeper translocation and mounted DMG are read-only even if the check passes
    expect(selectMacInstallDestination('/private/var/folders/x/AppTranslocation/ABC/d/Viezan.app/Contents/MacOS/Viezan', writable)).toBe('/Applications/Viezan.app')
    expect(selectMacInstallDestination('/Volumes/Viezan/Viezan.app/Contents/MacOS/Viezan', writable)).toBe('/Applications/Viezan.app')
    // Unwritable parent directory
    expect(selectMacInstallDestination('/Users/me/Apps/Viezan.app/Contents/MacOS/Viezan', readOnly)).toBe('/Applications/Viezan.app')
    // Not inside a bundle (dev)
    expect(selectMacInstallDestination('/usr/local/bin/electron', writable)).toBe('/Applications/Viezan.app')
    // The writability check receives the bundle's parent directory
    const canWrite = vi.fn(() => true)
    selectMacInstallDestination('/Users/me/Apps/Viezan.app/Contents/MacOS/Viezan', canWrite)
    expect(canWrite).toHaveBeenCalledWith('/Users/me/Apps')
  })

  it('generates a helper that reopens the old app on failure and always cleans up', () => {
    const script = buildMacInstallScript()
    expect(script).toContain('trap cleanup EXIT')
    expect(script).toContain('rm -f "$SCRIPT_PATH"')
    expect(script).toContain('rm -rf "$BACKUP_PATH"')
    const failBody = script.slice(script.indexOf('fail() {'), script.indexOf('trap cleanup EXIT'))
    expect(failBody).toContain('open "$DEST_PATH"')
    // A failed relaunch of the new app must not skip cleanup or roll back
    expect(script).toContain('if ! open "$DEST_PATH"; then')
  })

  const shellProbe = ['zsh', 'bash'].find((sh) => {
    try {
      return spawnSync(sh, ['-c', 'true']).status === 0
    } catch {
      return false
    }
  })

  it.skipIf(!shellProbe)('generates a syntactically valid shell script', () => {
    const dir = mkdtempSync(join(tmpdir(), 'viezan-script-'))
    try {
      const file = join(dir, 'install.zsh')
      writeFileSync(file, buildMacInstallScript(), 'utf8')
      const result = spawnSync(shellProbe as string, ['-n', file], { encoding: 'utf8' })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('only treats a missing latest*.yml as "no update"', () => {
    expect(isMissingUpdateMetadataError(new Error('Cannot find latest.yml in the latest release artifacts (https://github.com/x/y/releases/download/v1/latest.yml): HttpError: 404'))).toBe(true)
    expect(isMissingUpdateMetadataError(new Error('Cannot find latest-mac.yml in the latest release artifacts'))).toBe(true)
    expect(isMissingUpdateMetadataError(new Error('ENOENT: no such file or directory, open latest.yml'))).toBe(true)
    // Generic failures must stay errors
    expect(isMissingUpdateMetadataError(new Error('HttpError: 500 Internal Server Error'))).toBe(false)
    expect(isMissingUpdateMetadataError(new Error('HttpError: 404 Not Found https://example.com/other.zip'))).toBe(false)
    expect(isMissingUpdateMetadataError(new Error('Cannot find module foo'))).toBe(false)
    expect(isMissingUpdateMetadataError(new Error('net::ERR_INTERNET_DISCONNECTED while fetching latest.yml'))).toBe(false)
    expect(isMissingUpdateMetadataError('not an error object')).toBe(false)
  })

  it('restricts download redirects to https GitHub hosts', () => {
    expect(isTrustedGithubDownloadUrl('https://github.com/trunghieupham59/viezan/releases/download/v1/a.dmg')).toBe(true)
    expect(isTrustedGithubDownloadUrl('https://objects.githubusercontent.com/abc')).toBe(true)
    expect(isTrustedGithubDownloadUrl('https://release-assets.githubusercontent.com/abc')).toBe(true)
    expect(isTrustedGithubDownloadUrl('http://github.com/a.dmg')).toBe(false)
    expect(isTrustedGithubDownloadUrl('https://evil.com/a.dmg')).toBe(false)
    expect(isTrustedGithubDownloadUrl('https://github.com.evil.com/a.dmg')).toBe(false)
    expect(isTrustedGithubDownloadUrl('https://evilgithubusercontent.com/a.dmg')).toBe(false)
    expect(isTrustedGithubDownloadUrl('https://user:pw@github.com/a.dmg')).toBe(false)
    expect(isTrustedGithubDownloadUrl('not a url')).toBe(false)
  })
})
