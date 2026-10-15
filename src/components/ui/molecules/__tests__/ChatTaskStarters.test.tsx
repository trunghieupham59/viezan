import { fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../../i18n'
import { type ChatTaskStarterState, ChatTaskStarters } from '../ChatTaskStarters'

function Harness(props: Omit<ComponentProps<typeof ChatTaskStarters>, 'state' | 'onStateChange' | 'actualMode'> & { actualMode?: 'standard' | 'research' | 'web' | 'image' }) {
  const [state, setState] = useState<ChatTaskStarterState | null>(null)
  return <ChatTaskStarters {...props} actualMode={props.actualMode ?? 'standard'} state={state} onStateChange={setState} />
}

describe('ChatTaskStarters', () => {
  it.each(['en', 'vi', 'ja'] as const)('reports a manual mode mismatch in %s without changing mode', (locale) => {
    const t = TRANSLATIONS[locale]
    const props = { t, locale, onApply: vi.fn(), onBack: vi.fn() }
    const view = render(<Harness {...props} actualMode="standard" />)
    fireEvent.click(screen.getByRole('button', { name: t.chat_suggest_research + t.chat_suggest_research_desc }))
    expect(screen.getByRole('status')).toHaveTextContent(t.chat_task_planned_mode.replace('{mode}', t.chat_menu_deep_research))
    fireEvent.click(screen.getByRole('button', { name: t.chat_task_apply }))
    view.rerender(<Harness {...props} actualMode="research" />)
    expect(screen.getByRole('status')).toHaveTextContent(t.chat_task_applied)
    props.onApply.mockClear()
    view.rerender(<Harness {...props} actualMode="standard" />)
    expect(screen.getByRole('status')).toHaveTextContent(t.chat_task_mode_changed)
    expect(props.onApply).not.toHaveBeenCalled()
  })
  it.each(['en', 'vi', 'ja'] as const)('stages options and returns without applying in %s', (locale) => {
    const t = TRANSLATIONS[locale]
    const onApply = vi.fn()
    const onBack = vi.fn()
    render(<Harness t={t} locale={locale} onApply={onApply} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: t.chat_suggest_translate + t.chat_suggest_translate_desc }))
    expect(screen.getByRole('button', { name: `${t.chat_task_language} ${t.lang_names[locale]}` })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(t.chat_task_unapplied)
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t.chat_task_back }))
    expect(onBack).toHaveBeenCalledWith(false)
    expect(document.querySelectorAll('.prompt-card')).toHaveLength(4)
  })

  it.each(['en', 'vi', 'ja'] as const)('distinguishes applied and edited settings without rewriting a draft in %s', (locale) => {
    const t = TRANSLATIONS[locale]
    const onApply = vi.fn()
    const onBack = vi.fn()
    render(<Harness t={t} locale={locale} onApply={onApply} onBack={onBack} />)
    const name = t.chat_suggest_explain + t.chat_suggest_explain_desc
    fireEvent.click(screen.getByRole('button', { name }))
    fireEvent.click(screen.getByRole('button', { name: t.chat_task_apply }))
    expect(onApply).toHaveBeenCalledWith(`${t.chat_task_explain_template.replace('{option}', t.chat_task_simple)}\n\n`, 'standard')
    onApply.mockClear()
    expect(screen.getByRole('status')).toHaveTextContent(t.chat_task_applied)
    fireEvent.click(screen.getByRole('button', { name: `${t.chat_task_level} ${t.chat_task_simple}` }))
    fireEvent.click(screen.getByRole('option', { name: t.chat_task_steps }))
    expect(screen.getByRole('status')).toHaveTextContent(t.chat_task_unapplied)
    fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.getByRole('button', { name: `${t.chat_task_level} ${t.chat_task_steps}` })).toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t.chat_task_back }))
    expect(onBack).toHaveBeenCalledWith(true)
  })
})
