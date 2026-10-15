// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const modelsList = vi.fn()
const messagesCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    models = { list: modelsList }
    messages = { create: messagesCreate }
  },
}))

import { verifyClaudeKey } from '../translateProviderClaude'

describe('Anthropic API key verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the Models API so retirement of a Messages model cannot reject a valid key', async () => {
    modelsList.mockResolvedValue({ data: [{ id: 'claude-sonnet-4-6' }] })
    const { signal } = new AbortController()

    await expect(verifyClaudeKey('sk-ant-valid', { signal })).resolves.toBeUndefined()

    expect(modelsList).toHaveBeenCalledWith({ limit: 1 }, { signal })
    expect(messagesCreate).not.toHaveBeenCalled()
  })
})
