import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell } from '../AppShell'

describe('AppShell', () => {
  it('composes the navigation, page, and overlay slots', () => {
    render(
      <AppShell
        primaryNavigation={<nav aria-label="Test navigation" />}
        contextSidebar={<aside aria-label="Test context" />}
        overlays={<div role="dialog" aria-label="Test overlay" />}
      >
        <h1>Test page</h1>
      </AppShell>,
    )

    expect(screen.getByRole('navigation', { name: 'Test navigation' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Test context' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Test page')
    expect(screen.getByRole('dialog', { name: 'Test overlay' })).toBeInTheDocument()
  })

  it('renders the title bar strip and native material only when requested', () => {
    const { container, rerender } = render(
      <AppShell primaryNavigation={null} showTitlebar useNativeMaterial>
        <span>Page</span>
      </AppShell>,
    )

    expect(container.querySelector('.app-titlebar-drag')).toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-window-material', 'native')
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-titlebar', 'app')

    rerender(
      <AppShell primaryNavigation={null}>
        <span>Page</span>
      </AppShell>,
    )

    expect(container.querySelector('.app-titlebar-drag')).not.toBeInTheDocument()
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-window-material', 'opaque')
    expect(container.querySelector('.app-shell')).toHaveAttribute('data-titlebar', 'none')
  })
})
