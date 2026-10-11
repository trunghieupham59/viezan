import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { ChatBubbleIcon, MicrophoneIcon, TranslateIcon } from '../../ui/icons'
import { HistoryNavigation } from '../HistoryNavigation'

function Harness() {
  const [activeId, setActiveId] = useState<'chat' | 'translate' | 'live'>('chat')
  const [query, setQuery] = useState('needle')
  return (
    <HistoryNavigation
      tabs={[
        { id: 'chat', label: 'AI Chat', count: 2, Icon: ChatBubbleIcon },
        { id: 'translate', label: 'AI Translate', count: 1, Icon: TranslateIcon },
        { id: 'live', label: 'AI Interpret', count: 0, Icon: MicrophoneIcon },
      ]}
      activeId={activeId}
      query={query}
      label="History"
      title="History"
      subtitle="3 saved items"
      searchPlaceholder="Search history"
      clearSearchLabel="Clear search"
      onTabChange={setActiveId}
      onQueryChange={setQuery}
    />
  )
}

describe('HistoryNavigation', () => {
  it('moves selection and focus with tablist arrow keys', () => {
    render(<Harness />)
    const chatTab = screen.getByRole('tab', { name: /AI Chat/ })
    const translateTab = screen.getByRole('tab', { name: /AI Translate/ })

    chatTab.focus()
    fireEvent.keyDown(chatTab, { key: 'ArrowRight' })

    expect(translateTab).toHaveFocus()
    expect(translateTab).toHaveAttribute('aria-selected', 'true')
    expect(chatTab).toHaveAttribute('tabindex', '-1')
  })

  it('clears the query and restores focus to search', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    const search = screen.getByRole('textbox', { name: 'Search history' })
    expect(search).toHaveValue('')
    expect(search).toHaveFocus()
  })
})
