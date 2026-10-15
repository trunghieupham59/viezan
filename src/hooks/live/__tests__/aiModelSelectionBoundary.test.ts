import { describe, expect, it } from 'vitest'
import { createLiveAIModelSelectionBoundary } from '../aiModelSelectionBoundary'

describe('live AI model selection boundary', () => {
  it('captures the configured model when a session begins', () => {
    const boundary = createLiveAIModelSelectionBoundary()

    boundary.begin({ provider: 'openai', model: 'gpt-session' })

    expect(boundary.resolve({ provider: 'claude', model: 'claude-next' })).toEqual({
      provider: 'openai',
      model: 'gpt-session',
    })
  })

  it('uses the latest configured model only after the session boundary is cleared', () => {
    const boundary = createLiveAIModelSelectionBoundary()
    boundary.begin({ provider: 'openai', model: 'gpt-session' })

    boundary.clear()

    expect(boundary.resolve({ provider: 'claude', model: 'claude-next' })).toEqual({
      provider: 'claude',
      model: 'claude-next',
    })
  })

  it('restores the model recorded by a historical live session', () => {
    const boundary = createLiveAIModelSelectionBoundary()

    boundary.restore({ provider: 'gemini', model: 'gemini-recorded' })

    expect(boundary.resolve({ provider: 'openai', model: 'gpt-default' })).toEqual({
      provider: 'gemini',
      model: 'gemini-recorded',
    })
  })
})
