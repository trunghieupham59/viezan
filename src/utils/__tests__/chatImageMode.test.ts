import { describe, expect, it } from 'vitest'
import { imageInputSupport, supportsChatImageMode } from '../chatImageMode'

describe('supportsChatImageMode', () => {
  it('allows only the providers with image generation handlers in the main process', () => {
    expect(supportsChatImageMode('gemini')).toBe(true)
    expect(supportsChatImageMode('openai')).toBe(true)
    expect(supportsChatImageMode('claude')).toBe(false)
    expect(supportsChatImageMode('local')).toBe(false)
  })
})

describe('imageInputSupport', () => {
  it('knows cloud models and is unsure about unrecognised local ones', () => {
    expect(imageInputSupport('gemini', 'gemini-2.5-flash')).toBe('yes')
    expect(imageInputSupport('openai', 'gpt-3.5-turbo')).toBe('no')
    expect(imageInputSupport('local', 'gemma3:4b')).toBe('yes')
    expect(imageInputSupport('local', 'qwen2.5vl:7b')).toBe('yes')
    expect(imageInputSupport('local', 'qwen3:4b')).toBe('unknown')
    expect(imageInputSupport('local', 'local-auto')).toBe('unknown')
  })
})
