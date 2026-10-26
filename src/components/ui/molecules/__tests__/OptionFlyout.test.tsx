import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OptionFlyout, placeFlyout } from '../OptionFlyout'

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, right: left + width, bottom: top + height })

describe('placeFlyout', () => {
  const row = rect(720, 200, 400, 36)
  const viewport = { width: 1600, height: 900 }

  it('opens beside the boundary on the end side, level with the row', () => {
    expect(placeFlyout(row, rect(712, 100, 420, 460), { width: 240, height: 300 }, viewport, 8, 16))
      .toEqual({ side: 'end', top: 200, left: 1140, room: 868 })
  })

  it('flips to the start side when the end side has no room', () => {
    expect(placeFlyout(row, rect(712, 100, 420, 460), { width: 240, height: 300 }, { width: 1200, height: 900 }, 8, 16))
      .toMatchObject({ side: 'start', left: 464 })
  })

  it('keeps a tall list inside the viewport by moving it up', () => {
    expect(placeFlyout(rect(720, 700, 400, 36), rect(712, 100, 420, 700), { width: 240, height: 500 }, viewport, 8, 16).top)
      .toBe(384)
  })

  it('drops under the row, at its width, when neither side has room', () => {
    expect(placeFlyout(rect(40, 200, 400, 36), rect(16, 100, 450, 460), { width: 240, height: 300 }, { width: 480, height: 900 }, 8, 16))
      .toEqual({ side: 'below', top: 244, left: 40, room: 640, width: 400 })
  })
})

const OPTIONS = [
  { value: 'vi', label: 'Vietnamese' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: 'Japanese' },
  { value: 'vi-x', label: 'Tiếng Việt' },
]

function Harness({ onSurfaceKeyDown, searchable = false }: { onSurfaceKeyDown?: () => void; searchable?: boolean }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('en')
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the popover's document-level Escape
    <div data-flyout-boundary="" onKeyDown={onSurfaceKeyDown}>
      <button ref={anchorRef} type="button" onClick={() => setOpen(true)}>Translate</button>
      <button type="button">Elsewhere</button>
      <OptionFlyout open={open} anchorRef={anchorRef} label="Target language" value={value} options={OPTIONS}
        {...(searchable ? { searchPlaceholder: 'Search languages', noResultsLabel: 'No language found', clearSearchLabel: 'Clear search' } : {})}
        onSelect={setValue} onClose={(restore) => {
          setOpen(false)
          if (restore) anchorRef.current?.focus()
        }} />
    </div>
  )
}

describe('OptionFlyout', () => {
  it('focuses the chosen option, moves with arrows, and selects with a click', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    const list = screen.getByRole('listbox', { name: 'Target language' })
    expect(list.closest('.option-flyout')).not.toBeNull()
    await waitFor(() => expect(screen.getByRole('option', { name: 'English' })).toHaveFocus())
    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(screen.getByRole('option', { name: 'English' }), { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'Japanese' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('option', { name: 'Japanese' }), { key: 'Home' })
    expect(screen.getByRole('option', { name: 'Vietnamese' })).toHaveFocus()

    fireEvent.click(screen.getByRole('option', { name: 'Japanese' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Translate' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    expect(screen.getByRole('option', { name: 'Japanese' })).toHaveAttribute('aria-selected', 'true')
  })

  it('owns Escape and ArrowLeft so the surrounding popover stays open', () => {
    const surface = vi.fn()
    render(<Harness onSurfaceKeyDown={surface} />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    fireEvent.keyDown(screen.getByRole('option', { name: 'English' }), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Translate' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    fireEvent.keyDown(screen.getByRole('option', { name: 'English' }), { key: 'ArrowLeft' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(surface).not.toHaveBeenCalled()
  })

  it('closes on a pointer down outside without moving focus', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('narrows a long list with a search field that ignores diacritics', async () => {
    render(<Harness searchable />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    const search = screen.getByRole('searchbox', { name: 'Search languages' })
    await waitFor(() => expect(search).toHaveFocus())

    fireEvent.change(search, { target: { value: 'tieng viet' } })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Tiếng Việt'])

    // ArrowDown enters the list; ArrowUp on the first option returns to the field.
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: 'Tiếng Việt' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('option', { name: 'Tiếng Việt' }), { key: 'ArrowUp' })
    expect(search).toHaveFocus()

    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('No language found')

    // Enter takes the chosen option when it is still shown, else the first match.
    fireEvent.change(search, { target: { value: 'jap' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    expect(screen.getByRole('option', { name: 'Japanese' })).toHaveAttribute('aria-selected', 'true')
    // The query resets each time the flyout opens.
    expect(screen.getByRole('searchbox', { name: 'Search languages' })).toHaveValue('')
  })

  it('closes from the search field on Escape without closing the surface', () => {
    const surface = vi.fn()
    render(<Harness searchable onSurfaceKeyDown={surface} />)
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search languages' }), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(surface).not.toHaveBeenCalled()
  })
})
