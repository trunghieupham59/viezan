import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type CssRule, rulesOf, STYLESHEETS } from './cssRules'

/** Every layer that floats over content paints the shared floating material (floating-material.css). */
const FLOATING = [
  '.floating-panel',
  '.modal-surface',
  '.chat-research-info-popover',
  '.ai-config-panel',
  '.language-picker-panel',
  '.model-picker-panel',
  '.ai-select-field__menu',
  '.option-flyout',
  '.language-pair-tooltip',
  '.notification-toast',
]

/** Rules on a floating layer that are not floating surfaces themselves, and why. */
const NOT_SURFACES: Record<string, string> = {
  '.ai-configuration-popover': 'paints the material on its ::before backing layer so its fixed select menus stay anchored',
  '.chat-plus-menu': 'the menu element also carries .floating-panel',
  '.dialog-shell-layer': 'modal layer wrapper; DialogShell sits on a scrim and hosts fixed select menus, so it stays opaque',
  '.dialog-shell-backdrop': 'scrim',
  '.modal-backdrop': 'scrim',
  '.translate-options-panel': 'legacy rule with no element: TranslationOptions renders AIConfigurationPopover',
  '.notification-viewport': 'positions toasts; each .notification-toast paints the material',
  '.dictionary-selection-action': 'a Button atom; the atom paints its own background',
  '.primary-navigation-panel': 'navigation overlay painted with the chrome material',
  '.primary-navigation-backdrop': 'transparent click-catcher',
  '.ai-chat-sidebar': 'navigation overlay painted with the context navigation material',
}

const rules = STYLESHEETS.flatMap(rulesOf)
/** The last compound selector, i.e. the element the rule styles (pseudo-elements excluded). */
const subjectOf = (selector: string) => selector.split(/\s+|>|\+|~/).filter(Boolean).pop() ?? ''
const styles = (rule: CssRule, classes: string[]) => rule.selectors.some((selector) => {
  const subject = subjectOf(selector)
  return !subject.includes('::') && classes.some((name) => new RegExp(`${name.replace('.', '\\.')}(?![\\w-])`).test(subject))
})
const isSharedRule = (rule: CssRule) => rule.file.endsWith('floating-material.css')
  && FLOATING.every((name) => rule.selectors.includes(name))
  && /background\s*:\s*var\(--vzn-overlay-material\)/.test(rule.body)

describe('floating material', () => {
  it('paints every floating surface with the overlay material and overlay blur', () => {
    const shared = rules.filter(isSharedRule)
    expect(shared).toHaveLength(1)
    expect(shared[0].body).toMatch(/(?<!-webkit-)backdrop-filter\s*:\s*var\(--vzn-overlay-blur\)/)
    expect(shared[0].body).toMatch(/-webkit-backdrop-filter\s*:\s*var\(--vzn-overlay-blur\)/)
  })

  it('leaves no floating surface painting its own background or blur', () => {
    const own = rules.filter((rule) => !isSharedRule(rule) && styles(rule, FLOATING)
      && /(^|[;\s])(background(-color)?|backdrop-filter)\s*:/.test(rule.body))
      .map((rule) => `${rule.file.split(/[\\/]/).pop()}: ${rule.selectors.join(', ')}`)
    expect(own).toEqual([])
  })

  it('backs the AI configuration popover with the same material', () => {
    const backing = rules.find((rule) => rule.selectors.includes('.ai-configuration-popover::before'))
    expect(backing?.body).toMatch(/background\s*:\s*var\(--vzn-overlay-material\)/)
    expect(backing?.body).toMatch(/backdrop-filter\s*:\s*var\(--vzn-overlay-blur\)/)
  })

  it('accounts for every rule placed on a floating layer', () => {
    const layered = rules.filter((rule) => /z-index\s*:\s*var\(--vzn-layer-(context-overlay|picker|navigation-overlay|modal)\)/.test(rule.body))
    const unknown = layered.filter((rule) => !styles(rule, [...FLOATING, ...Object.keys(NOT_SURFACES)]))
      .map((rule) => rule.selectors.join(', '))
    // A new menu, picker or popover joins FLOATING; anything else is listed with its reason.
    expect(unknown).toEqual([])
  })

  it('declares the overlay blur in every preset block, blurring only in Glass', () => {
    const tokens = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8')
    const reduced = tokens.match(/@media \(prefers-reduced-transparency: reduce\)[^{]*\{[\s\S]*?\r?\n\}\r?\n/)?.[0] ?? ''
    const presets = tokens.replace(reduced, '')
    const blurs = [...presets.matchAll(/--vzn-overlay-blur:\s*([^;]+);/g)].map((match) => match[1])
    expect(blurs).toHaveLength([...presets.matchAll(/--vzn-blur-sm:/g)].length)
    expect(blurs.filter((value) => value !== 'none')).toHaveLength(2)
    // Reduced transparency or more contrast: Glass floats solid, unblurred layers.
    expect([...reduced.matchAll(/--vzn-overlay-blur:\s*none;/g)]).toHaveLength(2)
    expect(reduced).not.toMatch(/--vzn-overlay-material:\s*rgba/)
  })
})
