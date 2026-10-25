import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_DISMISS_DELAY_MS, TOAST_MAX_VISIBLE } from '../../../constants/ui'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { NotificationViewport } from '../NotificationViewport'

describe('NotificationViewport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useNotificationStore.getState().clear()
  })

  afterEach(() => {
    act(() => useNotificationStore.getState().clear())
    vi.useRealTimers()
  })

  it('shows only the newest few, newest last, and brings an older open one back when a newer leaves', () => {
    render(<NotificationViewport />)
    act(() => {
      const { notify } = useNotificationStore.getState()
      notify({ tone: 'error', message: 'Old problem' })
      for (let i = 1; i <= TOAST_MAX_VISIBLE; i++) notify({ tone: 'info', message: `Info ${i}` })
    })
    expect(screen.queryByText('Old problem')).toBeNull()
    const shown = screen.getAllByRole('status').map((toast) => toast.textContent)
    expect(shown).toHaveLength(TOAST_MAX_VISIBLE)
    expect(shown[shown.length - 1]).toContain(`Info ${TOAST_MAX_VISIBLE}`)

    act(() => { vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS) })
    expect(screen.getByRole('alert')).toHaveTextContent('Old problem')
  })

  it('renders a toast action as a button that runs its handler', () => {
    const onUndo = vi.fn()
    render(<NotificationViewport />)
    act(() => {
      useNotificationStore.getState().notify({
        key: 'chat-session-deleted', tone: 'success', message: 'Conversation deleted',
        actions: [{ label: 'Undo', onClick: onUndo }],
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('pauses the countdown while the pointer is on the stack', () => {
    const { container } = render(<NotificationViewport />)
    act(() => { useNotificationStore.getState().notify({ tone: 'success', message: 'Saved' }) })
    const stack = container.querySelector('.notification-viewport') as HTMLElement
    fireEvent.pointerEnter(stack)
    act(() => { vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS * 3) })
    expect(screen.getByText('Saved')).toBeInTheDocument()
    fireEvent.pointerLeave(stack)
    act(() => { vi.advanceTimersByTime(TOAST_DISMISS_DELAY_MS) })
    expect(screen.queryByText('Saved')).toBeNull()
  })
  it('lifts the stack above the chat composer only when they share a column', () => {
    const composer = document.createElement('div')
    composer.className = 'chat-composer'
    document.body.appendChild(composer)
    const rect = (left: number, right: number, top: number, bottom: number) => ({ left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect
    const stackRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this === composer ? rect(300, 1100, 600, 760) : rect(1000, 1360, 500, 860)
    })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const { container } = render(<NotificationViewport />)
    act(() => { useNotificationStore.getState().notify({ tone: 'info', message: 'Copied', durationMs: null }) })
    const stack = container.querySelector('.notification-viewport') as HTMLElement
    expect(stack).toHaveAttribute('data-lifted', 'true')
    expect(stack.style.getPropertyValue('--ui-toast-lift')).toBe('300px')

    stackRect.mockImplementation(function (this: HTMLElement) {
      return this === composer ? rect(300, 900, 600, 760) : rect(1000, 1360, 500, 860)
    })
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(stack).not.toHaveAttribute('data-lifted')

    // A centred composer (empty chat) with room below it: the stack stays in the corner.
    stackRect.mockImplementation(function (this: HTMLElement) {
      return this === composer ? rect(300, 1100, 200, 400) : rect(1000, 1360, 500, 860)
    })
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(stack).not.toHaveAttribute('data-lifted')

    stackRect.mockRestore()
    composer.remove()
  })
})
