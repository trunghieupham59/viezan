import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planImageRequest } from '../imagePromptService'

const base = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  hasPreviousImage: false,
  hasAttachedImage: false,
}

describe('planImageRequest', () => {
  beforeEach(() => {
    vi.mocked(window.api.chat).mockReset()
  })

  it('rewrites a short request into a detailed prompt', async () => {
    vi.mocked(window.api.chat).mockResolvedValue({
      success: true,
      reply: '{"action":"new","prompt":"A tabby cat sitting on a sunlit windowsill, soft light, detailed fur."}',
    })

    const plan = await planImageRequest({ ...base, text: 'vẽ con mèo' })

    expect(plan).toEqual({
      prompt: 'A tabby cat sitting on a sunlit windowsill, soft light, detailed fur.',
      editPrevious: false,
      rewritten: true,
    })
    const call = vi.mocked(window.api.chat).mock.calls[0][0]
    expect(call.systemPrompt).toContain('There is no earlier image')
    expect(call.messages[0].content[0].text).toContain('vẽ con mèo')
  })

  it('edits the previous image only when one exists and the planner says so', async () => {
    vi.mocked(window.api.chat).mockResolvedValue({
      success: true,
      reply: '{"action":"edit_previous","prompt":"Make the sky deep blue; keep everything else unchanged."}',
    })

    const withPrevious = await planImageRequest({
      ...base,
      text: 'làm bầu trời xanh hơn',
      history: 'USER: vẽ cánh đồng',
      hasPreviousImage: true,
    })
    expect(withPrevious.editPrevious).toBe(true)
    expect(vi.mocked(window.api.chat).mock.calls[0][0].systemPrompt).toContain('edit_previous')
    expect(vi.mocked(window.api.chat).mock.calls[0][0].messages[0].content[0].text).toContain('USER: vẽ cánh đồng')

    const withoutPrevious = await planImageRequest({ ...base, text: 'làm bầu trời xanh hơn' })
    expect(withoutPrevious.editPrevious).toBe(false)
  })

  it('never redirects an attached-image edit to the previous image', async () => {
    vi.mocked(window.api.chat).mockResolvedValue({
      success: true,
      reply: '{"action":"edit_previous","prompt":"Remove the background."}',
    })

    const plan = await planImageRequest({
      ...base,
      text: 'xoá nền',
      hasPreviousImage: true,
      hasAttachedImage: true,
    })

    expect(plan.editPrevious).toBe(false)
    expect(vi.mocked(window.api.chat).mock.calls[0][0].systemPrompt).toContain('EDIT instruction')
  })

  it.each([
    ['a failed call', { success: false, error: 'boom' }],
    ['a reply without JSON', { success: true, reply: 'sure!' }],
    ['an empty prompt', { success: true, reply: '{"action":"new","prompt":"  "}' }],
    ['malformed JSON', { success: true, reply: '{"prompt": }' }],
  ])('falls back to the user text after %s', async (_label, response) => {
    vi.mocked(window.api.chat).mockResolvedValue(response)

    expect(await planImageRequest({ ...base, text: ' vẽ con mèo ' })).toEqual({
      prompt: 'vẽ con mèo',
      editPrevious: false,
      rewritten: false,
    })
  })

  it('falls back when the planning call throws', async () => {
    vi.mocked(window.api.chat).mockRejectedValue(new Error('network'))

    expect((await planImageRequest({ ...base, text: 'a red fox' })).prompt).toBe('a red fox')
  })
})
