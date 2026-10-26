/// <reference types="node" />
// Reads the stylesheets from disk: Vitest stubs CSS imports, `?raw` included.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
export const STYLESHEETS = [
  join(SRC, 'index.css'),
  ...readdirSync(join(SRC, 'styles')).filter((name) => name.endsWith('.css')).map((name) => join(SRC, 'styles', name)),
]

export interface CssRule { file: string; selectors: string[]; body: string }

/** Splits a selector list on its top-level commas, keeping `:where(a, b)` whole. */
export function splitSelectors(list: string): string[] {
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
export function rulesOf(file: string): CssRule[] {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    file,
    selectors: splitSelectors(match[1]),
    body: match[2],
  }))
}
