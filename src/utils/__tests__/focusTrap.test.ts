import { afterEach, describe, expect, it } from 'vitest'
import { trapTabFocus } from '../focusTrap'

function setup() {
  document.body.innerHTML = '<div id="d"><button id="a">a</button><input id="b"/><button id="c">c</button><button id="x" disabled>x</button></div>'
  return {
    container: document.getElementById('d') as HTMLElement,
    a: document.getElementById('a') as HTMLElement,
    c: document.getElementById('c') as HTMLElement,
  }
}

const tab = (shiftKey = false) => new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })

afterEach(() => { document.body.innerHTML = '' })

describe('trapTabFocus', () => {
  it('wraps Tab from the last control to the first (ignoring disabled ones)', () => {
    const { container, a, c } = setup()
    c.focus()
    const event = tab()
    trapTabFocus(event, container)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(a)
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    const { container, a, c } = setup()
    a.focus()
    const event = tab(true)
    trapTabFocus(event, container)
    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(c)
  })

  it('leaves Tab alone in the middle of the dialog and ignores other keys', () => {
    const { container } = setup()
    document.getElementById('b')?.focus()
    const middle = tab()
    trapTabFocus(middle, container)
    expect(middle.defaultPrevented).toBe(false)

    const other = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    trapTabFocus(other, container)
    expect(other.defaultPrevented).toBe(false)
  })

  it('does nothing without a container or focusable controls', () => {
    const event = tab()
    trapTabFocus(event, null)
    expect(event.defaultPrevented).toBe(false)
  })
})
