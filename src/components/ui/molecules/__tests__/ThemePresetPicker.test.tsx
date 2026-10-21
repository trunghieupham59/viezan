import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemePresetPicker } from '../ThemePresetPicker'

const options = [
  { value: 'graphite', label: 'Graphite', description: 'Quiet neutrals' },
  { value: 'cosmos', label: 'Cosmos', description: 'Indigo accent' },
]

describe('ThemePresetPicker', () => {
  it('renders a labelled group of pressable cards that preview their own palette', () => {
    render(<ThemePresetPicker label="Color theme" value="cosmos" options={options} onChange={() => {}} />)

    expect(screen.getByRole('group', { name: 'Color theme' })).toBeInTheDocument()
    const graphite = screen.getByRole('button', { name: /Graphite/ })
    const cosmos = screen.getByRole('button', { name: /Cosmos/ })
    expect(cosmos).toHaveAttribute('aria-pressed', 'true')
    expect(cosmos).toHaveAttribute('data-selected', 'true')
    expect(cosmos).toHaveAttribute('data-control-variant', 'primary')
    expect(cosmos).toHaveAttribute('data-theme', 'cosmos')
    expect(graphite).toHaveAttribute('aria-pressed', 'false')
    expect(graphite).not.toHaveAttribute('data-selected')
    expect(graphite).toHaveAttribute('data-control-variant', 'neutral')
    expect(graphite).toHaveAttribute('data-theme', 'graphite')
    expect(screen.getByText('Indigo accent')).toBeInTheDocument()
  })

  it('reports the chosen preset', () => {
    const onChange = vi.fn()
    render(<ThemePresetPicker label="Color theme" value="graphite" options={options} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Cosmos/ }))
    expect(onChange).toHaveBeenCalledWith('cosmos')
  })
})
