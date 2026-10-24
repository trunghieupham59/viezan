import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveSessionPanel, type LiveSessionPanelProps } from '../live/LiveSessionPanel'

const labels: LiveSessionPanelProps['labels'] = {
  title: 'This session', summary: 'Summary', summaryEmpty: 'No summary yet', summarize: 'Summarise', openSummary: 'Open summary',
  summarizing: 'Summarising…', speakers: 'Speakers', speakersEmpty: 'No speakers', speakerLines: (n) => `${n} lines`,
  export: 'Export', exportTxt: 'Export TXT', exportSrt: 'Export SRT', previousSessions: (n) => `Previous sessions (${n})`,
}

function renderPanel(overrides: Partial<LiveSessionPanelProps> = {}) {
  const props: LiveSessionPanelProps = {
    labels, summaryExcerpt: null, isSummarizing: false, canSummarize: true, speakers: [], canExportTxt: true, canExportSrt: false,
    previousCount: 3, onOpenSummary: vi.fn(), onExportTxt: vi.fn(), onExportSrt: vi.fn(), onOpenPrevious: vi.fn(), ...overrides,
  }
  render(<LiveSessionPanel {...props} />)
  return props
}

describe('LiveSessionPanel', () => {
  it('summarises, exports and opens earlier sessions', () => {
    const props = renderPanel({ speakers: [{ id: 's1', name: 'Lan', lines: 4 }] })
    const panel = screen.getByRole('complementary', { name: 'This session' })
    fireEvent.click(within(panel).getByRole('button', { name: /Summarise/ }))
    expect(props.onOpenSummary).toHaveBeenCalled()
    expect(within(panel).getByText('Lan')).toBeInTheDocument()
    expect(within(panel).getByText('4 lines')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /SRT/ })).toBeDisabled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Previous sessions (3)' }))
    expect(props.onOpenPrevious).toHaveBeenCalled()
  })

  it('shows the summary excerpt and a busy state', () => {
    renderPanel({ summaryExcerpt: 'Decided to ship on Friday.' })
    expect(screen.getByText('Decided to ship on Friday.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open summary/ })).toBeEnabled()
  })

  it('announces summarising and blocks a second request', () => {
    renderPanel({ isSummarizing: true })
    expect(screen.getByRole('status')).toHaveTextContent('Summarising…')
    expect(screen.getByRole('button', { name: /Summarise/ })).toBeDisabled()
  })
})
