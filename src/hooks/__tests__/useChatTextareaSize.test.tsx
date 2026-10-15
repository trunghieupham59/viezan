import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChatTextareaSize } from '../useChatTextareaSize'

function Harness({ text, session = 'a' }: { text: string; session?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useChatTextareaSize(ref, text, session, true)
  return <textarea ref={ref} value={text} readOnly style={{ minHeight: '48px', maxHeight: '140px' }} />
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useChatTextareaSize', () => {
  it('preserves manual scroll when measuring temporarily clamps the upper region', () => {
    const view = render(<div className="chat-empty-state"><div className="chat-empty-scroll" /><Harness text="A" /></div>)
    const upper = view.container.querySelector('.chat-empty-scroll') as HTMLElement
    upper.scrollTop = 44
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => {
      upper.scrollTop = 0
      return 400
    })
    view.rerender(<div className="chat-empty-state"><div className="chat-empty-scroll" /><Harness text="A\nA" /></div>)
    expect(upper.scrollTop).toBe(44)
  })
  it.each(['', '\n'.repeat(10), ' \t\n  '])('shrinks visually blank drafts without discarding whitespace', (blank) => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400)
    const view = render(<Harness text="Long draft" />)
    const textarea = view.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.style.height).toBe('140px')
    view.rerender(<Harness text={blank} />)
    expect(textarea.style.height).toBe('0px')
    expect(textarea.style.minHeight).toBe('48px')
    expect(textarea.value).toBe(blank)
  })

  it('resizes a restored draft even when another session has the same text', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(80)
    const view = render(<Harness text="Same text" session="a" />)
    const textarea = view.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.style.height).toBe('80px')
    height.mockReturnValue(120)
    view.rerender(<Harness text="Same text" session="b" />)
    expect(textarea.style.height).toBe('120px')
  })

  it('reflows the draft when its container width changes', () => {
    let nextFrame: FrameRequestCallback = () => {}
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame = callback
      return 1
    })
    let notify: () => void = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notify = callback }
      observe() {}
      disconnect() {}
    })
    let width = 600
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width }) as DOMRect)
    const height = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(60)
    const view = render(<Harness text="A draft that wraps" />)
    const textarea = view.getByRole('textbox') as HTMLTextAreaElement
    height.mockReturnValue(100)
    width = 300
    notify()
    nextFrame(0)
    expect(textarea.style.height).toBe('100px')
  })

  it('does not scroll the upper region while resizing a focused draft', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { bottom: this.classList.contains('chat-empty-composer') ? 300 : 200, width: 600 } as DOMRect
    })
    const surface = (text: string) => <div className="chat-empty-state">
      <div className="chat-empty-composer"><Harness text={text} /></div>
    </div>
    const view = render(surface('short'))
    view.getByRole('textbox').focus()
    view.rerender(surface('Longer draft'))
    expect(view.container.querySelector('.chat-empty-state')?.scrollTop).toBe(0)
  })
})
