import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import type { LiveSession } from '../../../types'
import { LiveSessionHistoryPanel } from '../live/LiveSessionHistoryPanel'

const t = TRANSLATIONS.en

function session(overrides: Partial<LiveSession> & Pick<LiveSession, 'id' | 'rawTranscript'>): LiveSession {
  return {
    createdAt: Date.now() - 300_000,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    sourceLang: 'vi',
    targetLang: 'en',
    translation: `${overrides.rawTranscript} (en)`,
    wordCount: 12,
    ...overrides,
  }
}

const meeting = session({
  id: 'meeting',
  rawTranscript: 'Họp sáng thứ hai',
  translation: 'Monday morning meeting',
  summary: 'Agreed on the release date',
  wordCount: 1200,
})

function renderPanel(props: Partial<Parameters<typeof LiveSessionHistoryPanel>[0]> = {}) {
  const onOpen = vi.fn()
  const onDelete = vi.fn()
  const onClearHistory = vi.fn()
  render(
    <LiveSessionHistoryPanel
      sessions={[meeting, session({ id: 'short', rawTranscript: 'Xin chào' })]}
      activeSessionId="meeting"
      onOpen={onOpen}
      onDelete={onDelete}
      onClearHistory={onClearHistory}
      t={t}
      {...props}
    />,
  )
  return { onOpen, onDelete, onClearHistory }
}

describe('LiveSessionHistoryPanel', () => {
  it('lists saved sessions, marks the open one and reopens or deletes a row', () => {
    const { onOpen, onDelete } = renderPanel()
    expect(screen.getByRole('region', { name: 'Saved sessions' })).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'Open session: Họp sáng thứ hai' })
    expect(open).toHaveAttribute('aria-current', 'true')
    expect(within(open).getByText('Monday morning meeting')).toBeInTheDocument()
    expect(within(open).getByText(`${(1200).toLocaleString()} words`)).toBeInTheDocument()
    expect(within(open).getByText('Vietnamese → English')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open session: Xin chào' })).not.toHaveAttribute('aria-current')

    fireEvent.click(open)
    expect(onOpen).toHaveBeenCalledWith('meeting')
    fireEvent.click(screen.getByRole('button', { name: 'Delete: Xin chào' }))
    expect(onDelete).toHaveBeenCalledWith('short')
  })

  it('filters across transcript, translation and notes once the list is long enough', () => {
    const sessions = [meeting, ...['One', 'Two', 'Three', 'Four'].map((text) => session({ id: text, rawTranscript: text }))]
    renderPanel({ sessions })
    const filter = screen.getByRole('textbox', { name: 'Search history...' })
    fireEvent.change(filter, { target: { value: 'release date' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(filter, { target: { value: 'nothing here' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('No matching results')).toBeInTheDocument()
  })

  it('asks before clearing and shows the empty state without sessions', () => {
    const { onClearHistory } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved sessions' }))
    const dialog = screen.getByRole('dialog', { name: 'Clear saved sessions' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear saved sessions' }))
    expect(onClearHistory).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state and no footer when nothing is saved', () => {
    renderPanel({ sessions: [] })
    expect(screen.getByText('Sessions you record will appear here.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear saved sessions' })).not.toBeInTheDocument()
  })
})
