/// <reference types="node" />
// Reads the stylesheets from disk: Vitest stubs CSS imports, `?raw` included.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const STYLESHEETS = [
  join(SRC, 'index.css'),
  ...readdirSync(join(SRC, 'styles')).filter((name) => name.endsWith('.css')).map((name) => join(SRC, 'styles', name)),
]

interface CssRule { file: string; selectors: string[]; body: string }

/** Splits a selector list on its top-level commas, keeping `:where(a, b)` whole. */
function splitSelectors(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  return [...parts, current].map((selector) => selector.trim()).filter(Boolean)
}

/** Innermost `selector { declarations }` blocks; at-rule wrappers are skipped. */
function rulesOf(file: string): CssRule[] {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    file,
    selectors: splitSelectors(match[1]),
    body: match[2],
  }))
}

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

  it('does not stack a second ring on buttons that use the shared outline', () => {
    const buttonRings = rules.filter((rule) => rule.selectors.includes('.ui-button:focus-visible') && /box-shadow/.test(rule.body))
    expect(buttonRings).toEqual([])
  })
})
