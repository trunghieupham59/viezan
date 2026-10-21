import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThemePresetPicker } from '../ThemePresetPicker'

const options = [
  { value: 'graphite', label: 'Graphite', description: 'Quiet and compact' },
  { value: 'studio', label: 'Studio', description: 'Vivid gradients' },
]

describe('ThemePresetPicker', () => {
  it('renders a labelled group of pressable cards that preview their own persona', () => {
    const { container } = render(<ThemePresetPicker label="Style" value="studio" options={options} onChange={() => {}} />)

    expect(screen.getByRole('group', { name: 'Style' })).toBeInTheDocument()
    const graphite = screen.getByRole('button', { name: /Graphite/ })
    const studio = screen.getByRole('button', { name: /Studio/ })
    expect(studio).toHaveAttribute('aria-pressed', 'true')
    expect(studio).toHaveAttribute('data-selected', 'true')
    expect(studio).toHaveAttribute('data-control-variant', 'primary')
    expect(studio).toHaveAttribute('data-theme', 'studio')
    expect(graphite).toHaveAttribute('aria-pressed', 'false')
    expect(graphite).not.toHaveAttribute('data-selected')
    expect(graphite).toHaveAttribute('data-control-variant', 'neutral')
    expect(graphite).toHaveAttribute('data-theme', 'graphite')
    expect(screen.getByText('Vivid gradients')).toBeInTheDocument()
    // The miniature window is decorative: one per card, hidden from AT, with
    // the persona's chrome, reading type sample and accent action inside.
    const swatches = container.querySelectorAll('.theme-preset-swatch[aria-hidden="true"]')
    expect(swatches).toHaveLength(2)
    expect(swatches[0].querySelector('.theme-preset-swatch-nav-active')).not.toBeNull()
    expect(swatches[0].querySelector('.theme-preset-swatch-type')).toHaveTextContent('Aa')
    expect(swatches[0].querySelector('.theme-preset-swatch-action')).not.toBeNull()
  })

  it('reports the chosen preset', () => {
    const onChange = vi.fn()
    render(<ThemePresetPicker label="Style" value="graphite" options={options} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /Studio/ }))
    expect(onChange).toHaveBeenCalledWith('studio')
  })
})
