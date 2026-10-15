import { describe, expect, it } from 'vitest'
import { resolveGeminiImageModels, resolveOpenAIImageModel } from '../chatImageEdit'
import { GEMINI_IMAGE_EDIT_MODELS, OPENAI_IMAGE_EDIT_MODEL } from '../ipcConstants'

describe('image model resolution', () => {
  it('keeps the built-in Gemini ladder for chat-only model ids', () => {
    expect(resolveGeminiImageModels('gemini-2.5-flash')).toEqual([...GEMINI_IMAGE_EDIT_MODELS])
    expect(resolveGeminiImageModels('')).toEqual([...GEMINI_IMAGE_EDIT_MODELS])
  })

  it('puts an explicitly chosen Gemini image model first without duplicating it', () => {
    expect(resolveGeminiImageModels('gemini-3-pro-image-preview')).toEqual([
      'gemini-3-pro-image-preview',
      ...GEMINI_IMAGE_EDIT_MODELS,
    ])
    expect(resolveGeminiImageModels(GEMINI_IMAGE_EDIT_MODELS[1])).toEqual([
      GEMINI_IMAGE_EDIT_MODELS[1],
      GEMINI_IMAGE_EDIT_MODELS[0],
    ])
  })

  it('uses a chosen gpt-image model and otherwise the default', () => {
    expect(resolveOpenAIImageModel('gpt-image-1.5')).toBe('gpt-image-1.5')
    expect(resolveOpenAIImageModel('gpt-4.1')).toBe(OPENAI_IMAGE_EDIT_MODEL)
    expect(resolveOpenAIImageModel('dall-e-3')).toBe(OPENAI_IMAGE_EDIT_MODEL)
  })
})
