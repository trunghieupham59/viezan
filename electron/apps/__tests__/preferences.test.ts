// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreferences } from '../preferences'

const mocks = vi.hoisted(() => ({ command: vi.fn(), stat: vi.fn(), plist: vi.fn() }))
vi.mock('../../fileActions/native', () => ({ runFile: mocks.command }))
vi.mock('../inventory', () => ({ readPlist: mocks.plist }))
vi.mock('node:fs/promises', async original => ({ ...await original<typeof import('node:fs/promises')>(), lstat: mocks.stat }))
const domain = 'org.example.synthetic'
beforeEach(() => { vi.resetAllMocks(); mocks.stat.mockRejectedValue({ code: 'ENOENT' }) })
describe('macOS preference absence verification', () => {
  it('recognizes a positively missing domain but not permission errors', async () => {
    const prefs = createPreferences('/home/fixture')
    mocks.command.mockRejectedValueOnce({ code: 1, stderr: `Error: Domain '${domain}' not found.` })
    expect(await prefs.exists(domain)).toBe(false)
    mocks.command.mockRejectedValueOnce({ code: 1, stderr: 'Operation not permitted' })
    await expect(prefs.exists(domain)).rejects.toMatchObject({ issue: 'unreadable' })
  })
  it('allows the empty plist retained by macOS, never one containing persisted keys', async () => {
    const prefs = createPreferences('/home/fixture')
    mocks.command.mockResolvedValue({ stdout: '{\n}' })
    mocks.stat.mockResolvedValue({})
    mocks.plist.mockResolvedValueOnce({})
    expect(await prefs.exists(domain)).toBe(false)
    mocks.plist.mockResolvedValueOnce({ important: 'value' })
    expect(await prefs.exists(domain)).toBe(true)
  })
  it('does not call a successful command verified removal when values remain', async () => {
    const prefs = createPreferences('/home/fixture')
    mocks.command.mockResolvedValueOnce({ stdout: '' }).mockResolvedValueOnce({ stdout: '{ important = value; }' })
    await expect(prefs.remove(domain)).rejects.toMatchObject({ issue: 'changed' })
  })
  it('rejects global, Apple and path-shaped domains', async () => {
    const prefs = createPreferences('/home/fixture')
    for (const domain of ['NSGlobalDomain', 'com.apple.finder', '/tmp/settings', 'org.example/../../other']) {
      await expect(prefs.remove(domain)).rejects.toMatchObject({ issue: 'protected' })
    }
    expect(mocks.command).not.toHaveBeenCalled()
  })
})
