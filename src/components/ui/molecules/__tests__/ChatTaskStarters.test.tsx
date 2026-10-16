import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '../../../../i18n'
import { ChatTaskStarters } from '../ChatTaskStarters'

describe('ChatTaskStarters', () => {
  it.each(['en', 'vi', 'ja'] as const)('selects tasks directly from cards in %s', (locale) => {
    const t = TRANSLATIONS[locale]
    const onSelect = vi.fn()
    render(<ChatTaskStarters t={t} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: t.chat_suggest_translate + t.chat_suggest_translate_desc }))
    expect(onSelect).toHaveBeenCalledWith(0)
    expect(screen.queryByRole('button', { name: t.chat_task_apply })).not.toBeInTheDocument()
  })

  it.each(['en', 'vi', 'ja'] as const)('marks the current task and switches immediately in %s', (locale) => {
    const t = TRANSLATIONS[locale]
    const onSelect = vi.fn()
    render(<ChatTaskStarters t={t} state={{ selected: 3, options: { 3: 'email' }, applied: null, open: false }} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: t.chat_suggest_write + t.chat_suggest_write_desc })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: t.chat_suggest_translate + t.chat_suggest_translate_desc }))
    expect(onSelect).toHaveBeenCalledWith(0)
    expect(screen.queryByText(t.chat_task_unapplied)).not.toBeInTheDocument()
  })
})
