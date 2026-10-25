import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SettingsNavigation } from '../SettingsNavigation'

const Icon = () => null
const items = [
  { id: 'general', label: 'General', description: 'General settings', Icon },
  { id: 'about', label: 'About', description: 'About Viezan', Icon },
]

describe('SettingsNavigation', () => {
  it.each(['sidebar', 'tabs'] as const)('uses the sm navigation size in %s mode and marks the active item', (mode) => {
    render(<SettingsNavigation items={items} activeId="about" label="Settings" mode={mode} onSelect={() => {}} />)

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('data-control-size', 'sm')
    }
    expect(screen.getByRole('button', { name: 'About' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'General' })).not.toHaveAttribute('aria-current')
  })
})
