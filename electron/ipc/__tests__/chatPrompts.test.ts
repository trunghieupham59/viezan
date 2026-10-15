/**
 * Unit tests for `buildEnforcedSystemPrompt`.
 *
 * The chat reasoning regression that motivated these tests:
 *   A user asked a tax-withholding question with an unusual stated rule
 *   ("company withholds 100% of tax on the FULL gross salary"). The model
 *   silently overrode that constraint with the textbook scenario (apply
 *   personal deduction first, THEN compute tax) and returned "you owe / are
 *   owed nothing" — confidently wrong.
 *
 * The two-layer guardrail under test:
 *   1. Reading discipline — always present, even when carefulReasoning=false.
 *      Tells the model to take stated constraints as authoritative.
 *   2. Reasoning discipline — opt-in. Forces step-by-step math + a final
 *      self-check against every stated constraint.
 */
import { describe, expect, it } from 'vitest'
import { buildEnforcedSystemPrompt } from '../chatPrompts'

describe('buildEnforcedSystemPrompt', () => {
  it('falls back to the default helpful-assistant prompt when no user prompt is provided', () => {
    const out = buildEnforcedSystemPrompt('')
    expect(out).toContain('You are a helpful AI assistant')
    // No user-supplied content → no need for the "MUST strictly follow" clause.
    expect(out).not.toContain('MUST strictly follow the instructions above')
  })

  it('appends the strict-follow enforcement clause only when a user prompt is provided', () => {
    const withUser = buildEnforcedSystemPrompt('Speak only in Vietnamese.')
    expect(withUser).toContain('Speak only in Vietnamese.')
    expect(withUser).toContain('MUST strictly follow the instructions above')
  })

  it('always attaches the reading-discipline directive (even when carefulReasoning is off)', () => {
    const out = buildEnforcedSystemPrompt('Speak only in Vietnamese.')
    expect(out).toContain('READ CAREFULLY')
    expect(out).toContain('do NOT silently override')
  })

  it('always tells the model not to emit LaTeX, which the chat UI cannot render', () => {
    for (const carefulReasoning of [false, true]) {
      const out = buildEnforcedSystemPrompt('', { carefulReasoning })
      expect(out).toContain('FORMATTING')
      expect(out).toContain('Do NOT use LaTeX')
    }
  })

  it('omits the reasoning-discipline directive when carefulReasoning is false (default)', () => {
    const out = buildEnforcedSystemPrompt('Speak only in Vietnamese.')
    expect(out).not.toContain('REASONING DISCIPLINE')
    expect(out).not.toContain('Restate the user-provided assumptions')
  })

  it('appends the reasoning-discipline directive when carefulReasoning is true', () => {
    const out = buildEnforcedSystemPrompt('You are a tax expert.', { carefulReasoning: true })
    expect(out).toContain('REASONING DISCIPLINE')
    expect(out).toContain('Restate the user-provided assumptions')
    expect(out).toContain('Show step-by-step calculations')
    expect(out).toContain('run a self-check')
  })

  it('preserves user prompt order (user content first, then enforcement, then disciplines)', () => {
    const userPrompt = 'You are a tax expert who answers in Vietnamese.'
    const out = buildEnforcedSystemPrompt(userPrompt, { carefulReasoning: true })
    const userIdx = out.indexOf(userPrompt)
    const enforceIdx = out.indexOf('MUST strictly follow')
    const readIdx = out.indexOf('READ CAREFULLY')
    const reasonIdx = out.indexOf('REASONING DISCIPLINE')
    expect(userIdx).toBeGreaterThanOrEqual(0)
    expect(userIdx).toBeLessThan(enforceIdx)
    expect(enforceIdx).toBeLessThan(readIdx)
    expect(readIdx).toBeLessThan(reasonIdx)
  })

  it('trims whitespace from the user prompt to avoid leading/trailing blank sections', () => {
    const out = buildEnforcedSystemPrompt('   \n\n  hello  \n  ')
    expect(out.startsWith('hello')).toBe(true)
  })
})
