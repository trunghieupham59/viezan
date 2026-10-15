import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../store/useAppStore'
import type { SubtitleSettings } from '../../../types'
import { InterpretSubtitleConfiguration } from '../live/InterpretSubtitleConfiguration'

const COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#fde047' },
]
const SIZES = [
  { size: 14, label: 'S' },
  { size: 18, label: 'M' },
]
const INITIAL: SubtitleSettings = { textColor: '#ffffff', fontSize: 18, bgOpacity: 84 }

function Harness({ initialEnabled = false, onReset = vi.fn() }: { initialEnabled?: boolean; onReset?: () => void }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [settings, setSettings] = useState(INITIAL)
  return (
    <InterpretSubtitleConfiguration
      enabled={enabled}
      onEnabledChange={setEnabled}
      settings={settings}
      onSettingsChange={setSettings}
      onReset={onReset}
      colors={COLORS}
      fontSizes={SIZES}
    />
  )
}

describe('InterpretSubtitleConfiguration', () => {
  it('hides appearance controls until subtitles are switched on', () => {
    useAppStore.setState({ locale: 'en' })
    render(<Harness />)

    const toggle = screen.getByRole('switch', { name: 'Subtitles' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('button', { name: 'Yellow' })).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Yellow' })).toBeInTheDocument()
  })

  it('updates color, size and opacity inline and exposes selection state', () => {
    useAppStore.setState({ locale: 'en' })
    render(<Harness initialEnabled />)

    fireEvent.click(screen.getByRole('button', { name: 'Yellow' }))
    expect(screen.getByRole('button', { name: 'Yellow' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('14px')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: /Background Opacity/ }), { target: { value: '40' } })
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('calls onReset from the footer action', () => {
    useAppStore.setState({ locale: 'en' })
    const onReset = vi.fn()
    render(<Harness initialEnabled onReset={onReset} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
