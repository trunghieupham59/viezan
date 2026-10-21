import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThemePreview } from '../ThemePreview'

const labels = {
  label: 'Preview of the style: Paper',
  title: 'AI Chat',
  assistant: 'Here is the translation.',
  user: 'Translate this.',
  placeholder: 'Ask anything…',
}

describe('ThemePreview', () => {
  it('is a labelled image painted by the given style and pinned mode', () => {
    render(<ThemePreview preset="paper" dark labels={labels} />)

    const preview = screen.getByRole('img', { name: 'Preview of the style: Paper' })
    expect(preview).toHaveAttribute('data-theme', 'paper')
    expect(preview).toHaveAttribute('data-mode', 'dark')
    expect(screen.getByText('AI Chat')).toBeInTheDocument()
    expect(screen.getByText('Here is the translation.')).toBeInTheDocument()
    expect(screen.getByText('Translate this.')).toBeInTheDocument()
    expect(screen.getByText('Ask anything…')).toBeInTheDocument()
  })

  it('renders the light variant when not dark', () => {
    render(<ThemePreview preset="glass" dark={false} labels={labels} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-mode', 'light')
  })
})
