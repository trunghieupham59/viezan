import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShortcutList } from '../ShortcutList'

const items = [
  { id: 'launcher', label: 'Launcher', scope: 'System-wide', keys: ['Alt', 'Space'] },
  { id: 'quick', label: 'Quick Translate', scope: 'System-wide', keys: ['Alt', 'T'], inactive: true },
]

describe('ShortcutList', () => {
  it('says an inactive shortcut is off in text on the compact list, not only by fading', () => {
    render(<ShortcutList items={items} label="Shortcuts" conflictLabel="Conflict" unsetLabel="Not set" offLabel="off" compact />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('Quick Translate · off')
    expect(rows[0]).not.toHaveTextContent('off')
  })

  it('keeps "off" in the scope line on the full list', () => {
    render(<ShortcutList items={items} label="Shortcuts" conflictLabel="Conflict" unsetLabel="Not set" offLabel="off" />)
    expect(screen.getByText('System-wide · off')).toBeInTheDocument()
  })
})
