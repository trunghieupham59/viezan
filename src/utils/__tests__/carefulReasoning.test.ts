import { describe, expect, it } from 'vitest'
import { shouldUseCarefulReasoning } from '../carefulReasoning'

describe('shouldUseCarefulReasoning', () => {
  it.each([
    'Tính thuế thu nhập 25 triệu/tháng',
    'What is 15% of 240?',
    '2025年の税率は?',
  ])('enables it for quantitative message %s', (text) => {
    expect(shouldUseCarefulReasoning(text)).toBe(true)
  })

  it.each(['Giải thích Atomic Design', 'Explain how promises work', ''])(
    'keeps conversational message %j on the plain prompt',
    (text) => {
      expect(shouldUseCarefulReasoning(text)).toBe(false)
    },
  )

  it('treats a missing message as non-quantitative', () => {
    expect(shouldUseCarefulReasoning(undefined)).toBe(false)
  })
})
