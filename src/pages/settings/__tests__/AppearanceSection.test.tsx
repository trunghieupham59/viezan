import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TRANSLATIONS } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { AppearanceSection } from '../AppearanceSection'

const en = TRANSLATIONS.en

beforeEach(() => {
  act(() => useAppStore.setState({ locale: 'en', theme: 'light', themePreset: 'graphite', themeAccent: 'auto', fontSize: 'medium' }))
})
afterEach(cleanup)

describe('AppearanceSection', () => {
  it('previews the stored style in the stored mode and follows the hovered tile', () => {
    render(<AppearanceSection />)

    const preview = screen.getByRole('img', { name: `${en.settings_theme_preview_label}: ${en.settings_theme_preset_graphite}` })
    expect(preview).toHaveAttribute('data-theme', 'graphite')
    expect(preview).toHaveAttribute('data-mode', 'light')

    fireEvent.mouseEnter(screen.getByRole('radio', { name: /Paper/ }))
    const hovered = screen.getByRole('img', { name: `${en.settings_theme_preview_label}: ${en.settings_theme_preset_paper}` })
    expect(hovered).toHaveAttribute('data-theme', 'paper')
    expect(hovered).toHaveAttribute('data-mode', 'light')
    expect(screen.getByText(en.settings_theme_preset_paper_desc, { exact: false })).toBeInTheDocument()
    expect(useAppStore.getState().themePreset).toBe('graphite')

    fireEvent.mouseLeave(screen.getByRole('radio', { name: /Paper/ }))
    expect(screen.getByRole('img')).toHaveAttribute('data-theme', 'graphite')
  })

  it('previews and applies an accent on top of the style', () => {
    render(<AppearanceSection />)

    expect(screen.getByRole('img')).not.toHaveAttribute('data-accent')
    fireEvent.mouseEnter(screen.getByRole('radio', { name: en.settings_theme_accent_teal }))
    expect(screen.getByRole('img')).toHaveAttribute('data-accent', 'teal')
    expect(useAppStore.getState().themeAccent).toBe('auto')
    fireEvent.mouseLeave(screen.getByRole('radio', { name: en.settings_theme_accent_teal }))
    expect(screen.getByRole('img')).not.toHaveAttribute('data-accent')

    fireEvent.click(screen.getByRole('radio', { name: en.settings_theme_accent_violet }))
    expect(useAppStore.getState().themeAccent).toBe('violet')
    expect(screen.getByRole('img')).toHaveAttribute('data-accent', 'violet')
    fireEvent.click(screen.getByRole('radio', { name: en.settings_theme_accent_auto }))
    expect(useAppStore.getState().themeAccent).toBe('auto')
  })

  it('applies a style on click and pins dark mode for a dark-only style', () => {
    render(<AppearanceSection />)

    fireEvent.click(screen.getByRole('radio', { name: /Midnight/ }))
    expect(useAppStore.getState().themePreset).toBe('midnight')
    expect(useAppStore.getState().theme).toBe('light')
    expect(screen.getByRole('img')).toHaveAttribute('data-mode', 'dark')
    expect(screen.getByText(en.settings_theme_dark_only_hint)).toBeInTheDocument()
    for (const label of [en.settings_theme_light, en.settings_theme_system, en.settings_theme_dark]) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }

    fireEvent.click(screen.getByRole('radio', { name: /Graphite/ }))
    expect(screen.getByRole('button', { name: en.settings_theme_dark })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: en.settings_theme_dark }))
    expect(useAppStore.getState().theme).toBe('dark')
    expect(screen.getByRole('img')).toHaveAttribute('data-mode', 'dark')
  })
})
