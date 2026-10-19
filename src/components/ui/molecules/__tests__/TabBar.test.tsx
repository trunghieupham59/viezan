import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from '../TabBar'

const tabs = [
  { id: 'recent', label: 'Recent', count: 5, panelId: 'list' },
  { id: 'favorites', label: 'Favorites', count: 2, panelId: 'list' },
]

describe('TabBar', () => {
  it('renders a labelled tablist with counts, selection state and aria-controls', () => {
    render(<TabBar label="Lookup history" tabs={tabs} activeId="recent" onChange={() => {}} />)

    expect(screen.getByRole('tablist', { name: 'Lookup history' })).toBeInTheDocument()
    const recent = screen.getByRole('tab', { name: /Recent/ })
    const favorites = screen.getByRole('tab', { name: /Favorites/ })
    expect(recent).toHaveAttribute('aria-selected', 'true')
    expect(recent).toHaveAttribute('aria-controls', 'list')
    expect(recent).toHaveAttribute('data-control-variant', 'primary')
    expect(recent).toHaveAttribute('tabindex', '0')
    expect(favorites).toHaveAttribute('aria-selected', 'false')
    expect(favorites).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('5')).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('2')).not.toHaveAttribute('data-active')
  })

  it('selects on click and moves selection with arrow, Home and End keys', () => {
    const onChange = vi.fn()
    render(<TabBar label="Lookup history" tabs={tabs} activeId="recent" onChange={onChange} />)

    const recent = screen.getByRole('tab', { name: /Recent/ })
    const favorites = screen.getByRole('tab', { name: /Favorites/ })

    fireEvent.click(favorites)
    expect(onChange).toHaveBeenLastCalledWith('favorites')

    recent.focus()
    fireEvent.keyDown(recent, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('favorites')
    expect(favorites).toHaveFocus()

    fireEvent.keyDown(favorites, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('recent')
    expect(recent).toHaveFocus()

    fireEvent.keyDown(recent, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('favorites')
    fireEvent.keyDown(favorites, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith('recent')
  })
})
