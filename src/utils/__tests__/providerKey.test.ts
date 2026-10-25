import { describe, expect, it } from 'vitest'
import { selectedProviderMissingKey } from '../providerKey'

describe('selectedProviderMissingKey', () => {
  it('never flags the local provider, even with no keys at all', () => {
    expect(selectedProviderMissingKey('local', {})).toBe(false)
  })

  it('flags a cloud provider that has no stored key', () => {
    expect(selectedProviderMissingKey('openai', { openai: false, gemini: true })).toBe(true)
  })

  it('does not flag a cloud provider that has a key', () => {
    expect(selectedProviderMissingKey('openai', { openai: true })).toBe(false)
  })
})
