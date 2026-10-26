import { describe, expect, it } from 'vitest'
import { rulesOf, STYLESHEETS } from './cssRules'

const rules = STYLESHEETS.flatMap(rulesOf)
const removesOutline = (body: string) => /outline\s*:\s*(none|0)\b/.test(body)

describe('keyboard focus ring', () => {
  it('draws the shared ring from focus tokens', () => {
    const shared = rules.find((rule) => rule.file.endsWith('tokens.css')
      && rule.selectors.some((selector) => selector.startsWith(':where(') && selector.endsWith(':focus-visible')))
    expect(shared?.body).toMatch(/outline\s*:\s*var\(--vzn-focus-ring-width\)\s+solid\s+var\(--vzn-focus-ring\)/)
    expect(shared?.body).toMatch(/outline-offset\s*:\s*var\(--vzn-focus-ring-offset\)/)
    // Without !important, a control that draws its own ring can opt out.
    expect(shared?.body).not.toContain('!important')
  })

  it('never removes the outline from every element on keyboard focus', () => {
    const globalResets = rules.filter((rule) => removesOutline(rule.body)
      && rule.selectors.some((selector) => /^\*?:focus(-visible)?$/.test(selector)))
    expect(globalResets).toEqual([])
  })

  it('leaves text fields out of the shared ring', () => {
    const shared = rules.find((rule) => rule.file.endsWith('tokens.css')
      && rule.selectors.some((selector) => selector.startsWith(':where(') && selector.endsWith(':focus-visible')))
    const list = shared?.selectors.join(',') ?? ''
    expect(list).not.toMatch(/\btextarea\b/)
    // Only non-text inputs (checkbox, radio, range, …) are listed.
    expect(list).not.toMatch(/\binput\s*,|\binput\)/)
  })

  it('removes the browser outline from text fields too', () => {
    // Without it the UA `outline: auto` returns in the system accent colour.
    const reset = rules.find((rule) => rule.file.endsWith('tokens.css') && removesOutline(rule.body)
      && rule.selectors.some((selector) => selector.startsWith(':where(') && /\btextarea\b/.test(selector) && selector.endsWith(':focus-visible')))
    expect(reset).toBeDefined()
  })

  it('shows text-field focus with a neutral border, never the accent ring', () => {
    const textFieldFocus = rules.filter((rule) => rule.selectors.some((selector) => /:focus/.test(selector)
      && /(input|textarea|composer|filter-input|search)/.test(selector) && !/button/.test(selector)))
    const accented = textFieldFocus.filter((rule) => /--vzn-focus-ring|--vzn-action-border/.test(rule.body))
    expect(accented.map((rule) => rule.selectors.join(', '))).toEqual([])
  })

  it('does not stack a second ring on buttons that use the shared outline', () => {
    const buttonRings = rules.filter((rule) => rule.selectors.includes('.ui-button:focus-visible') && /box-shadow/.test(rule.body))
    expect(buttonRings).toEqual([])
  })
})
