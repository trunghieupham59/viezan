import { describe, expect, it } from 'vitest'
import { supportsChatImageMode } from '../chatImageMode'

describe('supportsChatImageMode', () => {
  it('allows only the providers with image generation handlers in the main process', () => {
    expect(supportsChatImageMode('gemini')).toBe(true)
    expect(supportsChatImageMode('openai')).toBe(true)
    expect(supportsChatImageMode('claude')).toBe(false)
    expect(supportsChatImageMode('local')).toBe(false)
  })
})
