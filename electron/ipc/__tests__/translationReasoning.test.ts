import { describe, expect, it } from 'vitest'
import {
  getClaudeReasoningConfig,
  getGeminiMaxOutputTokens,
  getGeminiThinkingConfig,
  getOpenAIReasoningEffort,
} from '../translationReasoning'

describe('translation reasoning provider mapping', () => {
  it('maps OpenAI effort only for documented reasoning families', () => {
    expect(getOpenAIReasoningEffort('gpt-5-mini', 'medium')).toBe('medium')
    expect(getOpenAIReasoningEffort('gpt-4.1-mini', 'medium')).toBeUndefined()
    expect(getOpenAIReasoningEffort('gpt-5-mini', 'auto')).toBeUndefined()
  })

  it('does not send reasoning_effort to models that reject it', () => {
    expect(getOpenAIReasoningEffort('gpt-5-chat-latest', 'medium')).toBeUndefined()
    expect(getOpenAIReasoningEffort('o1-mini', 'medium')).toBeUndefined()
    expect(getOpenAIReasoningEffort('o1-preview', 'medium')).toBeUndefined()
    expect(getOpenAIReasoningEffort('o3-mini', 'medium')).toBe('medium')
    expect(getOpenAIReasoningEffort('o1', 'low')).toBe('low')
    expect(getOpenAIReasoningEffort('gpt-5.1', 'high')).toBe('high')
  })

  it('uses adaptive thinking for Claude 4.6+', () => {
    expect(getClaudeReasoningConfig('claude-sonnet-4-6', 'low')).toEqual({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
    })
    expect(getClaudeReasoningConfig('claude-sonnet-4-20250514', 'high')).toEqual({})
  })

  it('maps Gemini 2.5 levels to documented thinking budgets', () => {
    expect(getGeminiThinkingConfig('gemini-2.5-flash', 'low')).toEqual({ thinkingBudget: 1_024 })
    expect(getGeminiThinkingConfig('gemini-2.5-pro', 'medium')).toEqual({ thinkingBudget: 8_192 })
    expect(getGeminiThinkingConfig('gemini-2.5-flash-lite', 'high')).toEqual({ thinkingBudget: 24_576 })
    expect(getGeminiThinkingConfig('gemini-3.1-pro-preview', 'medium')).toEqual({ thinkingLevel: 'medium' })
    expect(getGeminiThinkingConfig('gemini-2.0-flash', 'high')).toBeUndefined()
  })
})

describe('getGeminiMaxOutputTokens', () => {
  it('uses the large ceiling for Gemini 2.5 and newer, the legacy one otherwise', () => {
    expect(getGeminiMaxOutputTokens('gemini-2.5-flash')).toBe(65_536)
    expect(getGeminiMaxOutputTokens('gemini-2.5-pro')).toBe(65_536)
    expect(getGeminiMaxOutputTokens('gemini-3.1-pro-preview')).toBe(65_536)
    expect(getGeminiMaxOutputTokens('gemini-2.0-flash')).toBe(8_192)
    expect(getGeminiMaxOutputTokens('gemini-1.5-pro')).toBe(8_192)
    expect(getGeminiMaxOutputTokens('some-unknown-model')).toBe(8_192)
  })
})
