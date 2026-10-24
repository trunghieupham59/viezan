import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import type { ChatMessage, ResearchStepPhase } from '../../../types'
import { ResearchStepsPanel } from '../ResearchStepsPanel'

const t = TRANSLATIONS.en

const step = (id: string, phase: ResearchStepPhase, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, role: 'assistant', content: [{ type: 'text', text: id }], timestamp: 1,
  isResearchStep: true, researchStepPhase: phase, researchStepLabel: phase, ...extra,
})

beforeEach(() => act(() => useAppStore.setState({ locale: 'en' })))

describe('ResearchStepsPanel', () => {
  it('shows each pipeline step and where the run is while it runs', () => {
    render(<ResearchStepsPanel steps={[step('a', 'analyze'), step('s1', 'survey'), step('s2', 'survey', { isLoading: true })]} />)
    const progress = screen.getByRole('list', { name: t.chat_research_progress_label })
    const items = within(progress).getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('data-status'))).toEqual(['done', 'active', 'pending', 'pending', 'pending', 'pending'])
    expect(items[1]).toHaveTextContent('2 aspects')
    expect(screen.getByRole('button', { expanded: true })).toHaveTextContent('Deep research · step 2 / 6')
  })

  it('explains a failed step and retries it', () => {
    const onRetry = vi.fn()
    render(<ResearchStepsPanel steps={[step('a', 'analyze'), step('s', 'survey', { error: 'offline' })]} onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 failed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry step 2' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('leaves out a phase the run skipped and collapses to a summary once finished', () => {
    const { rerender } = render(<ResearchStepsPanel steps={[step('a', 'analyze'), step('c', 'cross')]} onResume={vi.fn()} />)
    const ids = within(screen.getByRole('list', { name: t.chat_research_progress_label })).getAllByRole('listitem').map((item) => item.textContent)
    expect(ids.join('|')).not.toMatch(/Dig deeper|Gap/i)
    rerender(<ResearchStepsPanel steps={[step('a', 'analyze'), step('c', 'cross'), step('z', 'synth')]} />)
    expect(screen.queryByRole('list', { name: t.chat_research_progress_label })).toBeNull()
  })
})
