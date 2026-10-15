import { beforeEach, describe, expect, it, vi } from 'vitest'

const openExternal = vi.fn()

vi.mock('electron', () => ({
  shell: { openExternal: (...args: unknown[]) => openExternal(...args) },
  app: { getPath: () => '' },
}))

import { openOllamaDownloadPage, registerLocalAiHandlers } from '../localAi'

beforeEach(() => {
  openExternal.mockReset()
})

describe('openOllamaDownloadPage', () => {
  it('opens the vendor page and reports a manual install (nothing is installed by the app)', async () => {
    openExternal.mockResolvedValue(undefined)
    const result = await openOllamaDownloadPage()
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(String(openExternal.mock.calls[0][0])).toMatch(/^https:\/\//)
    expect(result).toMatchObject({ success: true, manual: true })
  })

  it('returns a structured error when the browser cannot be opened', async () => {
    openExternal.mockRejectedValue(new Error('no browser'))
    const result = await openOllamaDownloadPage()
    expect(result.success).toBe(false)
    expect(result.error).toContain('no browser')
  })
})

describe('local AI IPC channels', () => {
  it('no longer exposes a cancel-install channel (there is no installer process to cancel)', () => {
    const channels: string[] = []
    registerLocalAiHandlers({ handle: (channel: string) => { channels.push(channel) } } as never)
    expect(channels).toContain('local-ai:installOllama')
    expect(channels).not.toContain('local-ai:cancelInstallOllama')
  })
})
